const mongoose = require('mongoose');

const studentReferralSchema = new mongoose.Schema({
  referrerEmail: { type: String, required: true },
  referredEmail: { type: String, required: true },
  date: { type: Date, default: Date.now },
  isUsed: { type: Boolean, default: false } // Add this field
});

module.exports = mongoose.model('StudentReferral', studentReferralSchema);
