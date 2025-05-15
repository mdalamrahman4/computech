// backend/models/Student.js
const mongoose = require('mongoose');

 const studentSchema = new mongoose.Schema({
   rollNo:       { type: String, unique: true },
   name:         String,
   email:        { type: String, unique: true },
   class:        String,
   board:        String,
   passwordHash: String,
   referralCode:      String,
  signupCouponUsed:  { type: String, default: null },
  signupDiscount:    { type: Number, default: 0 },
  approved:          { type: Boolean, default: false }
 });


module.exports = mongoose.model('Student', studentSchema);
