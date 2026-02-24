const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Team = require('../models/Team');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const User = require('../models/User');
const { auth, roleCheck } = require('../middleware/auth');
const { generateQR } = require('../utils/generateQR');
const { sendTicketEmail } = require('../utils/email');
const { v4: uuidv4 } = require('uuid');

// NOTE: THIS CODE IS TO BE IGNORED AND NOT USED, HACKATHON TEAMS ARE NOT IMPLEMENTED.

// Create a team for a team-event
router.post('/', auth, roleCheck('participant'), async (req, res) => {
  try {
    const { eventId, name, maxSize } = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.isTeamEvent) {
      return res.status(400).json({ message: 'This event does not support team registration' });
    }

    if (event.status !== 'published' && event.status !== 'ongoing') {
      return res.status(400).json({ message: 'Event is not accepting registrations' });
    }

    // Check if user is already in a team for this event
    const existingTeam = await Team.findOne({
      event: eventId,
      $or: [
        { leader: req.user._id },
        { 'members.user': req.user._id, 'members.status': { $ne: 'rejected' } }
      ]
    });

    if (existingTeam) {
      return res.status(400).json({ message: 'You are already in a team for this event' });
    }

    // Generate invite code
    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    const team = new Team({
      name,
      event: eventId,
      leader: req.user._id,
      members: [{ user: req.user._id, status: 'accepted', joinedAt: new Date() }],
      inviteCode,
      maxSize: Math.min(maxSize || event.maxTeamSize, event.maxTeamSize),
      minSize: event.minTeamSize,
    });

    await team.save();

    await team.populate('leader', 'firstName lastName email');
    await team.populate('members.user', 'firstName lastName email');

    res.status(201).json(team);
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//Join team via invite code
router.post('/join/:code', auth, roleCheck('participant'), async (req, res) => {
  try {
    const team = await Team.findOne({ inviteCode: req.params.code })
      .populate('event');

    if (!team) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    if (team.isComplete) {
      return res.status(400).json({ message: 'Team is already complete' });
    }

    const acceptedCount = team.members.filter(m => m.status === 'accepted').length;
    if (acceptedCount >= team.maxSize) {
      return res.status(400).json({ message: 'Team is full' });
    }

    // Check if user is already in a team for this event
    const existingTeam = await Team.findOne({
      event: team.event._id,
      $or: [
        { leader: req.user._id },
        { 'members.user': req.user._id, 'members.status': { $ne: 'rejected' } }
      ]
    });

    if (existingTeam) {
      return res.status(400).json({ message: 'You are already in a team for this event' });
    }

    // Add member
    team.members.push({
      user: req.user._id,
      status: 'accepted',
      joinedAt: new Date()
    });

    // Check if team is now complete
    const newAcceptedCount = team.members.filter(m => m.status === 'accepted').length;
    if (newAcceptedCount >= team.minSize) {
      team.isComplete = true;

      // Auto-create registrations for all accepted members
      const event = await Event.findById(team.event._id);
      for (const member of team.members.filter(m => m.status === 'accepted')) {
        const existingReg = await Registration.findOne({
          event: team.event._id,
          participant: member.user
        });

        if (!existingReg) {
          const ticketId = `FEL-${uuidv4().substring(0, 8).toUpperCase()}`;
          const participant = await User.findById(member.user);
          const qrCode = await generateQR({
            ticketId,
            eventId: event._id,
            eventName: event.name,
            participantId: member.user,
            teamName: team.name
          });

          const registration = new Registration({
            event: team.event._id,
            participant: member.user,
            team: team._id,
            ticketId,
            qrCode,
            status: 'registered',
          });
          await registration.save();

          // Increment registration count
          event.registrationCount += 1;

          // Send ticket email
          if (participant) {
            await sendTicketEmail(participant, event, ticketId, qrCode);
          }
        }
      }
      await event.save();
    }

    await team.save();
    await team.populate('members.user', 'firstName lastName email');

    res.json(team);
  } catch (error) {
    console.error('Join team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/teams/my - Get current user's teams
router.get('/my', auth, roleCheck('participant'), async (req, res) => {
  try {
    const teams = await Team.find({
      'members.user': req.user._id,
      'members.status': 'accepted'
    })
    .populate('event', 'name type startDate endDate status')
    .populate('leader', 'firstName lastName email')
    .populate('members.user', 'firstName lastName email')
    .sort({ createdAt: -1 });

    res.json(teams);
  } catch (error) {
    console.error('Get my teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/teams/:id - Get team details
router.get('/:id', auth, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('event', 'name type startDate endDate status isTeamEvent minTeamSize maxTeamSize')
      .populate('leader', 'firstName lastName email')
      .populate('members.user', 'firstName lastName email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    res.json(team);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
