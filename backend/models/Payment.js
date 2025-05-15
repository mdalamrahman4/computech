// backend/models/Payment.js
const mongoose = require('mongoose');

// Define a schema for discount details
const discountDetailSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['signup', 'referral', 'coupon', 'initial'],
    required: true 
  },
  code: String,  // For coupon discounts
  count: Number, // For referral discounts
  amount: { type: Number, required: true }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  studentEmail: String,
  studentRoll: String,
  studentName: String,  // Added student name for easier reporting
  amount: Number,
  method: String,
  screenshot: String,
  approved: { type: Boolean, default: false },
  month: String,
  discountCoupon: String,   // Stores the coupon code used
  discounts: { type: Number, default: 0 }, // Total discount amount
  discountDetails: [discountDetailSchema], // Detailed breakdown of applied discounts
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);