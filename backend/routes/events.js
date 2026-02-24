const express = require('express');
const router = express.Router();
const https = require('https');
const Event = require('../models/Event');
const User = require('../models/User');
const Registration = require('../models/Registration');
const { auth, roleCheck } = require('../middleware/auth');

// Send Discord webhook notification for a published event
const sendDiscordNotification = (event, organizer) => {
  try {
    if (!organizer.discordWebhook) {
      console.log('Discord: No webhook URL configured for organizer');
      return;
    }

    const webhookUrl = organizer.discordWebhook.trim();
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/') && !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
      console.log('Discord: Invalid webhook URL:', webhookUrl);
      return;
    }

    const fields = [
      { name: 'Type', value: event.type === 'merchandise' ? 'Merchandise' : 'Normal Event', inline: true },
      { name: 'Eligibility', value: event.eligibility === 'all' ? 'Everyone' : `${event.eligibility.toUpperCase()} students only`, inline: true },
    ];

    if (event.startDate) {
      fields.push({ name: 'Start Date', value: new Date(event.startDate).toLocaleString(), inline: true });
    }
    if (event.endDate) {
      fields.push({ name: 'End Date', value: new Date(event.endDate).toLocaleString(), inline: true });
    }
    if (event.registrationDeadline) {
      fields.push({ name: 'Registration Deadline', value: new Date(event.registrationDeadline).toLocaleString(), inline: true });
    }
    if (event.registrationFee > 0) {
      fields.push({ name: 'Fee', value: `Rs.${event.registrationFee}`, inline: true });
    }
    if (event.registrationLimit > 0) {
      fields.push({ name: 'Capacity', value: `${event.registrationLimit} spots`, inline: true });
    }
    if (event.type === 'merchandise' && event.merchandiseItems?.length > 0) {
      const itemList = event.merchandiseItems.map(i => `- ${i.name} - Rs.${i.price} (${i.stock} in stock)`).join('\n');
      fields.push({ name: 'Available Items', value: itemList });
    }
    if (event.tags?.length > 0) {
      fields.push({ name: 'Tags', value: event.tags.join(', '), inline: true });
    }

    const payload = JSON.stringify({
      username: organizer.organizerName || 'Felicity Events',
      embeds: [{
        title: `New Event: ${event.name}`,
        description: event.description
          ? (event.description.length > 400 ? event.description.substring(0, 397) + '...' : event.description)
          : 'No description provided.',
        color: event.type === 'merchandise' ? 0xE67E22 : 0x3498DB,
        fields,
        footer: { text: `Published by ${organizer.organizerName || 'Unknown Club'}` },
        timestamp: new Date().toISOString(),
      }],
    });

    const url = new URL(webhookUrl);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('Discord webhook sent successfully');
        } else {
          console.error(`Discord webhook failed (${res.statusCode}):`, body);
        }
      });
    });

    req.on('error', (err) => {
      console.error('Discord webhook request error:', err.message);
    });

    req.write(payload);
    req.end();
  } catch (err) {
    console.error('Discord webhook error:', err.message);
  }
};

// Browse events
router.get('/', async (req, res) => {
  try {
    const {
      search, type, eligibility, dateFrom, dateTo,
      organizer, tags, followedClubs, sort,
      page = 1, limit = 12
    } = req.query;

    // Get inactive organizer IDs to exclude their events
    const inactiveOrgs = await User.find({ role: 'organizer', isActive: false }).select('_id');
    const inactiveOrgIds = inactiveOrgs.map(o => o._id);

    const filter = {
      status: { $in: ['published', 'ongoing'] },
      organizer: { $nin: inactiveOrgIds },
    };

    // Text search (partial & fuzzy matching)
    if (search) {
      // Escape regex special characters and split into words
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const words = search.trim().split(/\s+/).filter(w => w.length > 0);

      // Build a fuzzy regex for each word
      const buildFuzzyPattern = (word) => {
        const escaped = escapeRegex(word);
        return escaped.split('').join('.?');
      };

      // Each word must match at least one field (AND logic across words)
      const wordConditions = words.map(word => {
        const fuzzyPattern = buildFuzzyPattern(word);
        return {
          $or: [
            { name: { $regex: fuzzyPattern, $options: 'i' } },
            { description: { $regex: fuzzyPattern, $options: 'i' } },
            { tags: { $regex: fuzzyPattern, $options: 'i' } },
          ]
        };
      });

      // Search organizer names
      const orgPatterns = words.map(w => buildFuzzyPattern(w));
      const orgRegex = orgPatterns.map(p => new RegExp(p, 'i'));
      const matchingOrgs = await User.find({
        role: 'organizer',
        isActive: true,
        $or: orgRegex.map(r => ({ organizerName: { $regex: r } }))
      }).select('_id');
      const matchingOrgIds = matchingOrgs.map(o => o._id);

      if (matchingOrgIds.length > 0) {
        // Add organizer match as an alternative for each word condition
        wordConditions.forEach(cond => {
          cond.$or.push({ organizer: { $in: matchingOrgIds } });
        });
      }

      if (wordConditions.length === 1) {
        filter.$or = wordConditions[0].$or;
      } else {
        filter.$and = wordConditions;
      }
    }

    // Filter by type
    if (type && type !== 'all') {
      filter.type = type;
    }

    // Filter by eligibility
    if (eligibility && eligibility !== 'all') {
      filter.eligibility = eligibility;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.startDate = {};
      if (dateFrom) filter.startDate.$gte = new Date(dateFrom);
      if (dateTo) filter.startDate.$lte = new Date(dateTo);
    }

    // Filter by specific organizer
    if (organizer) {
      // Combine with existing $nin filter for inactive orgs
      filter.organizer = { $nin: inactiveOrgIds, $eq: organizer };
    }

    // Filter by followed clubs (comma-separated organizer IDs)
    if (followedClubs) {
      const clubIds = followedClubs.split(',').filter(id => !inactiveOrgIds.some(oid => oid.toString() === id));
      filter.organizer = { $in: clubIds };
    }

    // Sort options
    let sortOption = { createdAt: -1 }; // Default: newest first
    if (sort === 'deadline') sortOption = { registrationDeadline: 1 };
    if (sort === 'startDate') sortOption = { startDate: 1 };
    if (sort === 'name') sortOption = { name: 1 };
    if (sort === 'trending') sortOption = { views: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [events, total] = await Promise.all([
      Event.find(filter)
        .populate('organizer', 'organizerName category contactEmail')
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit)),
      Event.countDocuments(filter)
    ]);

    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Browse events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Trending events (top 5 by views in last 24h)
router.get('/trending', async (req, res) => {
  try {
    // Exclude events from inactive organizers
    const inactiveOrgs = await User.find({ role: 'organizer', isActive: false }).select('_id');
    const inactiveOrgIds = inactiveOrgs.map(o => o._id);

    const events = await Event.find({
      status: { $in: ['published', 'ongoing'] },
      organizer: { $nin: inactiveOrgIds },
    })
    .populate('organizer', 'organizerName category')
    .sort({ views: -1, registrationCount: -1 })
    .limit(5);

    res.json(events);
  } catch (error) {
    console.error('Trending events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single event details
router.get('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('organizer', 'organizerName category description contactEmail');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // On-demand status update based on current date
    const now = new Date();
    let statusChanged = false;
    if (['published', 'ongoing', 'closed'].includes(event.status)) {
      if (event.endDate && event.endDate <= now && event.status !== 'completed') {
        event.status = 'completed';
        statusChanged = true;
      } else if (['published', 'closed'].includes(event.status) && event.startDate && event.startDate <= now && (!event.endDate || event.endDate > now)) {
        event.status = 'ongoing';
        statusChanged = true;
      }
    }

    // Per-user view counting: only count once per account
    const userId = req.user._id.toString();
    if (!event.viewedBy.some(id => id.toString() === userId)) {
      event.viewedBy.push(req.user._id);
      event.views += 1;
      statusChanged = true; // force save
    }

    if (statusChanged) {
      await event.save();
    }

    res.json(event);
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create event (organizer only)
router.post('/', auth, roleCheck('organizer'), async (req, res) => {
  try {
    const {
      name, description, type, eligibility,
      startDate, endDate, registrationDeadline,
      registrationLimit, registrationFee, tags,
      customForm, merchandiseItems,
    } = req.body;

    // Validate event name
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Please enter the name of the event' });
    }

    // Date validations
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: 'Start date must be before end date' });
    }
    if (registrationDeadline && endDate && new Date(registrationDeadline) >= new Date(endDate)) {
      return res.status(400).json({ message: 'Registration deadline must be before end date' });
    }
    if (registrationDeadline && startDate && new Date(registrationDeadline) > new Date(startDate)) {
      return res.status(400).json({ message: 'Registration deadline must be on or before start date' });
    }

    // Enforce registration fee = 0 for merchandise events
    const effectiveFee = type === 'merchandise' ? 0 : (registrationFee || 0);

    const event = new Event({
      name,
      description,
      type,
      organizer: req.user._id,
      eligibility: eligibility || 'all',
      startDate,
      endDate,
      registrationDeadline,
      registrationLimit: registrationLimit || 0,
      registrationFee: effectiveFee,
      tags: tags || [],
      status: 'draft',
      customForm: type === 'normal' ? (customForm || []) : [],
      merchandiseItems: type === 'merchandise' ? (merchandiseItems || []) : [],
    });

    await event.save();
    await event.populate('organizer', 'organizerName category');

    res.status(201).json(event);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update event
router.put('/:id', auth, roleCheck('organizer'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Verify ownership
    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this event' });
    }

    // Date validations for edits
    const { startDate, endDate, registrationDeadline } = req.body;
    const effStart = startDate || event.startDate;
    const effEnd = endDate || event.endDate;
    const effDeadline = registrationDeadline || event.registrationDeadline;
    if (effStart && effEnd && new Date(effStart) >= new Date(effEnd)) {
      return res.status(400).json({ message: 'Start date must be before end date' });
    }
    if (effDeadline && effEnd && new Date(effDeadline) >= new Date(effEnd)) {
      return res.status(400).json({ message: 'Registration deadline must be before end date' });
    }
    if (effDeadline && effStart && new Date(effDeadline) > new Date(effStart)) {
      return res.status(400).json({ message: 'Registration deadline must be on or before start date' });
    }

    // Status-based editing restrictions
    if (event.status === 'draft') {
      // Free edits on draft
      const { __v, _id, organizer: _o, ...updates } = req.body;
      Object.assign(event, updates);
    } else if (event.status === 'published') {
      // Limited edits on published: description, extend deadline, increase limit, close registrations
      const allowedFields = ['description', 'registrationDeadline', 'registrationLimit', 'status'];
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          event[field] = req.body[field];
        }
      });
    } else if (event.status === 'ongoing' || event.status === 'closed' || event.status === 'completed') {
      // Only status change allowed
      if (req.body.status) {
        event.status = req.body.status;
      } else {
        return res.status(400).json({ message: 'Only status changes are allowed for ongoing/closed/completed events' });
      }
    }

    await event.save();
    await event.populate('organizer', 'organizerName category');

    res.json(event);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Publish event
router.put('/:id/publish', auth, roleCheck('organizer'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (event.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft events can be published' });
    }

    // Validate required fields for publishing
    if (!event.startDate || !event.endDate) {
      return res.status(400).json({ message: 'Start date and end date are required before publishing' });
    }

    if (event.type === 'merchandise' && (!event.merchandiseItems || event.merchandiseItems.length === 0)) {
      return res.status(400).json({ message: 'Merchandise events must have at least one merchandise item before publishing' });
    }

    event.status = 'published';
    await event.save();

    // Send Discord webhook notification
    const organizer = await User.findById(event.organizer);
    if (organizer) {
      sendDiscordNotification(event, organizer);
    }

    res.json(event);
  } catch (error) {
    console.error('Publish event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Close event
router.put('/:id/close', auth, roleCheck('organizer'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (event.status !== 'published') {
      return res.status(400).json({ message: 'Only published events can be closed. Ongoing events cannot be closed.' });
    }

    event.status = 'closed';
    await event.save();

    res.json(event);
  } catch (error) {
    console.error('Close event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a draft event
router.delete('/:id', auth, roleCheck('organizer'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (event.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft events can be deleted' });
    }

    // Delete any registrations for this event (shouldn't exist for drafts, but just in case)
    await Registration.deleteMany({ event: event._id });
    await Event.findByIdAndDelete(req.params.id);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
