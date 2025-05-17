const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const Student      = require('../models/Student');
const Payment      = require('../models/Payment');
const ReferralCode = require('../models/ReferralCode');
const StudentReferral = require('../models/StudentReferral');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();
router.use(requireAdmin);
// backend/routes/admin.js - Add at the top
router.use((req, res, next) => {
  // Debug session state
  //console.log("Admin route access, session:", req.session);
  next();
});
// Pending Students
router.get('/students/pending', async (req, res) => {
  const list = await Student.find({ approved: false }).lean();
  res.json(list);
});
// GET all students with last payment info
router.get('/students', requireAdmin, async (req, res) => {
  try {
    const students = await Student.aggregate([
      {
        $lookup: {
          from: 'payments',
          localField: 'email',
          foreignField: 'studentEmail',
          as: 'payments'
        }
      },
      {
        $addFields: {
          lastPayment: { $max: "$payments.date" }
        }
      },
      {
        $project: {
          rollNo: 1,
          name: 1,
          class: 1,
          board: 1,
          school: 1,
          lastPayment: 1
        }
      }
    ]);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
router.get('/students/search', requireAdmin, async (req, res) => {
  const query = req.query.q;
  try {
    const students = await Student.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { rollNo: { $regex: query, $options: 'i' } }
      ]
    });
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve Student
router.post('/students/approve/:id', async (req, res) => {
  await Student.findByIdAndUpdate(req.params.id, { approved: true });
  res.json({ message: 'Student approved' });
});

// Delete Student
router.delete('/students/:id', async (req, res) => {
  await Student.findByIdAndDelete(req.params.id);
  res.json({ message: 'Student deleted' });
});

// POST /api/admin/payments/:id/reject
router.post('/payments/:id/reject', async (req, res) => {
  try {
    // Find the payment
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    if (payment.approved) {
      return res.status(400).json({ error: 'Payment already approved' });
    }
    
    // If a coupon was used, free it up for reuse
    if (payment.discountCoupon) {
      await ReferralCode.findOneAndUpdate(
        { code: payment.discountCoupon },
        { $unset: { usedBy: 1 } }
      );
    }
    
    // If referral discount was used, mark referrals as unused
    if (payment.discountDetails) {
      const referralDiscount = payment.discountDetails.find(d => d.type === 'referral');
      if (referralDiscount) {
        await StudentReferral.updateMany(
          { referrerEmail: payment.studentEmail, isUsed: true },
          { $set: { isUsed: false } }
        );
      }
    }
    
    // Delete the payment record
    await payment.deleteOne();
    
    res.json({ message: 'Payment rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/receipts/:filename
router.get('/receipts/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, '../uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream'; // Default
    
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === '.png') {
      contentType = 'image/png';
    }
    
    // Set proper content type and send the file
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    // Stream the file to the response
    const filestream = fs.createReadStream(filepath);
    filestream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Payments List (with referral and student details)
router.get('/payments', async (req, res) => {
  const list = await Payment.aggregate([
    { $lookup:{
        from:'students',
        localField:'studentEmail',
        foreignField:'email',
        as:'studentDetails'
    }},
    { $unwind:'$studentDetails' },
    { $project:{
        _id:1,
        studentEmail:1,
        studentName:'$studentDetails.name',
        studentRoll:'$studentDetails.rollNo',
        amount:1,
        method:1,
        approved:1,
        date:1,
        screenshot:1,
        month:1,
        discountCoupon:1,
        discounts:1,
        discountDetails:1
    }},
    { $sort:{ date:-1 } }
  ]);
  res.json(list);
});

// Approve Payment
router.post('/payments/approve/:id', async (req, res) => {
  await Payment.findByIdAndUpdate(req.params.id, { approved: true });
  res.json({ message: 'Payment approved' });
});

// POST /api/admin/referral - Create referral code
router.post('/referral', async (req, res) => {
  try {
    const { code, discount } = req.body;
    
    // Check if code already exists
    const existing = await ReferralCode.findOne({ code: code.trim().toUpperCase() });
    if (existing) {
      return res.status(400).json({ error: 'Code already exists' });
    }
    
    // Create new referral code
    await new ReferralCode({
      code: code.trim().toUpperCase(),
      discount: Number(discount),
      createdBy: 'admin', // For admin-created coupons
      usedBy: null,
      type: 'admin'  // Explicitly set type for admin-created coupons
    }).save();
    
    res.json({ message: 'Discount coupon created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/coupons - List all coupons
router.get('/coupons', async (req, res) => {
  try {
    const coupons = await ReferralCode.find({ type: 'admin' }).lean();
    
    // For each coupon, count how many times it's been used
    for (let coupon of coupons) {
      const usedCount = coupon.usedBy ? 1 : 0;
      coupon.usedCount = usedCount;
    }
    
    res.json(coupons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/coupons/:id - Delete a coupon
router.delete('/coupons/:id', async (req, res) => {
  try {
    const coupon = await ReferralCode.findById(req.params.id);
    
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }
    
    if (coupon.usedBy) {
      return res.status(400).json({ error: 'Cannot delete coupon that has been used' });
    }
    
    await coupon.deleteOne();
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List Referral Codes (with creator + used info)
router.get('/referral', async (req, res) => {
  const list = await ReferralCode.find().lean();
  for (let r of list) {
    if (r.createdBy === 'admin') {
      r.creatorName = 'Admin';
      r.creatorRoll = null;
    } else {
      const creator = await Student.findOne({ email: r.createdBy }).lean();
      r.creatorName = creator?.name || null;
      r.creatorRoll = creator?.rollNo || null;
    }
    
    if (r.usedBy) {
      const user = await Student.findOne({ email: r.usedBy }).lean();
      r.usedByName = user?.name || null;
      r.usedByRoll = user?.rollNo || null;
    } else {
      r.usedByName = null;
      r.usedByRoll = null;
    }
    
    // Check if discount has been applied to referrer (for student referral codes)
    if (r.type === 'student') {
      const referralPayment = await Payment.findOne({
        'discountDetails.type': 'referral',
        studentEmail: r.createdBy
      });
      r.discountApplied = !!referralPayment;
    } else {
      r.discountApplied = null; // Not applicable for admin codes
    }
  }
  res.json(list);
});

// Monthly Stats
router.get('/monthly-stats', async (req, res) => {
  const stats = await Payment.aggregate([
    { $group:{ _id:'$month', count:{ $sum:1 } } },
    { $sort:{ _id:1 } }
  ]);
  res.json(stats.map(s => ({ month: s._id, count: s.count })));
});

// Monthly Details
router.get('/monthly-stats/:month', async (req, res) => {
  const details = await Payment.aggregate([
    { $match:{ month:req.params.month } },
    { $lookup:{
        from:'students',
        localField:'studentEmail',
        foreignField:'email',
        as:'studentDetails'
    }},
    { $unwind:'$studentDetails' },
    { $project:{
        studentEmail:1,
        studentName:'$studentDetails.name',
        studentRoll:'$studentDetails.rollNo',
        amount:1, 
        method:1, 
        approved:1, 
        date:1, 
        screenshot:1, 
        discountCoupon:1,
        discounts:1,
        discountDetails:1
    }},
    { $sort:{ date:-1 } }
  ]);
  res.json(details);
});

module.exports = router;
