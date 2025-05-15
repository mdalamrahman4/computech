// backend/routes/auth.js
const express      = require('express');
const bcrypt       = require('bcryptjs');
const Student      = require('../models/Student');
const Counter      = require('../models/Counter');
const ReferralCode = require('../models/ReferralCode');
const StudentReferral = require('../models/StudentReferral'); // Added missing import
const router       = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const {
      name,
      email,
      class: cls,
      board,
      password,
      referralCode  // ← optional referral code at signup
    } = req.body;
    // 1) Prevent duplicate emails
    if (await Student.findOne({ email })) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    // 2) Generate rollNo and hash password
    const cnt    = await Counter.findByIdAndUpdate(
      { _id: 'student' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const rollNo = `${cls}-${board}-${cnt.seq}`;
    const hash   = await bcrypt.hash(password, 12);
    // 3) Base student object
    const myCode = Math.random().toString(36).substr(2, 8).toUpperCase();
    const stuObj = {
      rollNo,
      name,
      email,
      class: cls,
      board,
      passwordHash:    hash,
      referralCode:    myCode,
      signupCouponUsed: null,
      signupDiscount:   0
    };
    // 4) If referralCode provided, validate & apply
    if (referralCode) {
      try {
        const code = referralCode.trim().toUpperCase();
        
        // Check if this is a student's referral code
        const referringStudent = await Student.findOne({ referralCode: code });
        if (!referringStudent) {
          return res
            .status(400)
            .json({ error: 'Invalid referral code. Please use a student referral code.' });
        }
        
        // Apply the discount - we'll record the referral relationship later
        // after this student is successfully created
        stuObj.signupCouponUsed = code;
        stuObj.signupDiscount   = 100;
        
        // Store referrer email for later use
        const referrerEmail = referringStudent.email;
        
        // 5) Save new student first
        const newStudent = await new Student(stuObj).save();
        
        // 6) Now create the referral record - after student is created
        try {
          await new StudentReferral({
            referrerEmail: referrerEmail,
            referredEmail: email
          }).save();
        } catch (refErr) {
          console.error('Error recording referral relationship, but student was created:', refErr);
          // Don't fail the entire signup if just the referral tracking fails
        }
        
        res.json({ message: 'Account created, pending admin approval' });
      } catch (e) {
        console.error('Error during referral validation:', e);
        return res
          .status(500)
          .json({ error: 'Server error validating referral code' });
      }
    } else {
      // 5) Save new student (no referral code case)
      await new Student(stuObj).save();
      res.json({ message: 'Account created, pending admin approval' });
    }
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login (student or admin)
// Login (student or admin)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Check for admin login
  if (email === 'admin@compu.com' && password === 'admin123') {
    req.session.role = 'admin'; // Ensure this matches what requireAdmin middleware checks
    
    // Add debug logging
    console.log("Admin login successful, session set:", req.session);
    
    return res.json({ role: 'admin' });
  }
  
  // Student login code...
  const stu = await Student.findOne({ email });
  if (!stu || !stu.approved || !(await bcrypt.compare(password, stu.passwordHash))) {
    return res.status(400).json({ error: 'Invalid credentials or not approved' });
  }
  
  req.session.role = 'student';
  req.session.user = email;
  res.json({ role: 'student' });
});


router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

router.get('/status', (req, res) => {
  res.json({ role: req.session.role || null });
});

module.exports = router;