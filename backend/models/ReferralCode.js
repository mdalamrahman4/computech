// backend/models/ReferralCode.js
const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  code:      { type: String, unique: true },
  discount:  Number,
  createdBy: String,  // referrer’s email
  usedBy:    { type: String, default: null },  // only for admin codes
  type:      { type: String, enum: ['admin', 'student'], required: true }
});

module.exports = mongoose.model('ReferralCode', referralSchema);
