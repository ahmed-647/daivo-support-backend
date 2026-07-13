// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

// 1. Verify Token
const protect = (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: "Not authorized, token missing" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role }
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: "Not authorized, token invalid or expired" });
    }
};

// 2. Role-based Authorization (dynamic)
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Role (${req.user ? req.user.role : 'unknown'}) is not authorized to access this resource`
            });
        }
        next();
    };
};

module.exports = { protect, authorizeRoles };