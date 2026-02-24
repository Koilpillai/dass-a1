// Seed script - Creates the admin account
//Run with: node seed.js

//Admin is the first user in the system. No UI registration for admin.

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const User = require('./models/User');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin account already exists:');
      console.log(`  Email: ${existingAdmin.email}`);
      console.log('  (Password was set during initial seed)');
      process.exit(0);
    }

    // Create admin account
    const adminEmail = 'admin@felicity.iiit.ac.in';
    const adminPassword = 'admin123'; // Change this in production!

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const admin = new User({
      firstName: 'System',
      lastName: 'Admin',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      isActive: true,
    });

    await admin.save();

    console.log('\n✅ Admin account created successfully!');
    console.log('================================');
    console.log(`  Email:    ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log('================================');
    console.log('⚠️  Save these credentials! Change the password after first login.\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedAdmin();
