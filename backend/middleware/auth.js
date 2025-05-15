// This file should have these exports
const requireStudent = (req, res, next) => {
  if (req.session && req.session.role === 'student' && req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized: students only' });
};

const requireAdmin = (req, res, next) => {
  // Add debugging to find the issue
  console.log("Session data:", {
    hasSession: !!req.session,
    sessionRole: req.session?.role,
    expectedRole: 'admin'
  });
  
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized: admin only' });
};

module.exports = { requireStudent, requireAdmin };
