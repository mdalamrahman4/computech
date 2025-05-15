const express         = require('express');
const Student         = require('../models/Student');
const Payment         = require('../models/Payment');
const ReferralCode    = require('../models/ReferralCode');
const StudentReferral = require('../models/StudentReferral');
const { requireStudent } = require('../middleware/auth');
const upload          = require('../config/upload');

const router = express.Router();

const ALLOWED_MONTHS = [
  '2025-04','2025-05','2025-06','2025-07','2025-08','2025-09',
  '2025-10','2025-11','2025-12','2026-01','2026-02','2026-03'
];

router.get('/me', async (req, res) => {
  try {
    const student = await Student.findOne({ email: req.session.user });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Use .find().length instead of countDocuments
    const totalReferrals = (await StudentReferral.find({
      referrerEmail: req.session.user,
      isUsed: { $ne: true } // Only count unused referrals
    })).length;

    // Get existing payments for this student
    const payments = await Payment.find({ 
      studentEmail: req.session.user 
    }).sort({ month: 1 }).lean();
    
    // Create the months array with status info
    const months = ALLOWED_MONTHS.map(month => {
      const payment = payments.find(p => p.month === month);
      return {
        month,
        status: payment ? (payment.approved ? 'paid' : 'pending') : 'unpaid',
        paymentId: payment?._id || null
      };
    });

    // Calculate available referral discount
    const hasUnpaidMonths = months.some(m => m.status === 'unpaid');
    const referralDiscount = hasUnpaidMonths ? totalReferrals * 100 : 0;

    res.json({
      student: {
        rollNo: student.rollNo,
        name: student.name,
        email: student.email,
        class: student.class,
        board: student.board,
        referralCode: student.referralCode,
        signupCouponUsed: student.signupCouponUsed,
        signupDiscount: student.signupDiscount,
        referralDiscount: referralDiscount
      },
      referralCount: totalReferrals,
      months
    });
  } catch (err) {
    console.error('Error fetching student data:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/student/coupon/:code
router.get('/coupon/:code', requireStudent, async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    
    // First check if the coupon exists at all
    const coupon = await ReferralCode.findOne({ code });
    
    if (!coupon) {
      return res.status(404).json({ error: 'Invalid coupon code' });
    }
    
    // Then validate type and usage
    if (coupon.type !== 'admin') {
      return res.status(400).json({ error: 'Not a valid discount coupon' });
    }
    
    if (coupon.usedBy) {
      return res.status(400).json({ error: 'Coupon already used' });
    }
    
    res.json({ discount: coupon.discount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// POST /api/student/pay
router.post('/pay', requireStudent, upload.single('screenshot'), async (req, res) => {
  try {
    const { method, month, signupDiscount, discountCoupon } = req.body;

    if (!ALLOWED_MONTHS.includes(month)) {
      return res.status(400).json({ error: 'Invalid month' });
    }
    if (await Payment.findOne({ studentEmail: req.session.user, month })) {
      return res.status(400).json({ error: 'Already requested' });
    }

    // Get the student record
    const student = await Student.findOne({ email: req.session.user });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Start with base price
    let amount = 600;
    let appliedDiscounts = [];
    
    // Apply initial discount (signup or referral)
    if (signupDiscount && Number(signupDiscount) > 0) {
      amount -= Number(signupDiscount);
      appliedDiscounts.push({
        type: 'initial',
        amount: Number(signupDiscount)
      });
    }

    // Apply coupon discount if provided
    let couponUsed = null;
    if (discountCoupon) {
      // First find if coupon exists without type restriction
      const coupon = await ReferralCode.findOne({ 
        code: discountCoupon.trim().toUpperCase()
      });
      
      if (!coupon) {
        return res.status(400).json({ error: 'Invalid coupon code' });
      }
      
      // Then check if it's the right type
      if (coupon.type !== 'admin') {
        return res.status(400).json({ error: 'Not a valid discount coupon' });
      }
      
      if (coupon.usedBy) {
        return res.status(400).json({ error: 'Coupon already used' });
      }
      
      amount -= coupon.discount;
      couponUsed = coupon.code;
      
      appliedDiscounts.push({
        type: 'coupon',
        code: coupon.code,
        amount: coupon.discount
      });
      
      // Mark the coupon as used
      coupon.usedBy = req.session.user;
      await coupon.save();
    }

    // For referral system
    if (month !== ALLOWED_MONTHS[0]) { // Not first month
      // Get unused referrals - use .find().length instead of countDocuments
      const referrals = await StudentReferral.find({
        referrerEmail: req.session.user,
        isUsed: { $ne: true }
      });
      const referralCount = referrals.length;
      
      if (referralCount > 0) {
        const referralDiscount = referralCount * 100;
        amount -= referralDiscount;
        
        appliedDiscounts.push({
          type: 'referral',
          count: referralCount,
          amount: referralDiscount
        });
        
        // Mark these referrals as used after applying the discount
        await StudentReferral.updateMany(
          { referrerEmail: req.session.user, isUsed: { $ne: true } },
          { $set: { isUsed: true } }
        );
      }
    }

    // Ensure amount is not negative
    amount = Math.max(0, amount);

    // Create the payment record
    await new Payment({
      studentEmail: student.email,
      studentRoll: student.rollNo,
      studentName: student.name,
      amount,
      method,
      screenshot: req.file?.filename || null,
      month,
      discountCoupon: couponUsed,
      discounts: appliedDiscounts.reduce((total, disc) => total + disc.amount, 0),
      discountDetails: appliedDiscounts
    }).save();

    res.json({ 
      message: 'Payment requested', 
      amount,
      discounts: appliedDiscounts
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/student/pay/:id
router.delete('/pay/:id', requireStudent, async (req, res) => {
  try {
    const pay = await Payment.findOne({
      _id: req.params.id,
      studentEmail: req.session.user,
      approved: false
    });
    
    if (!pay) return res.status(400).json({ error: 'Cannot delete' });
    
    // If there was a coupon used, free it up for reuse
    if (pay.discountCoupon) {
      await ReferralCode.findOneAndUpdate(
        { code: pay.discountCoupon },
        { $set: { usedBy: null } }
      );
    }
    
    await pay.deleteOne();
    res.json({ message: 'Request removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
