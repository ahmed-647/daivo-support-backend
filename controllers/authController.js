// controllers/authController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Helper: generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
};

// 1. REGISTER USER
exports.register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "Name, email and password are required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "User already registered with this email" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const allowedRoles = ['admin', 'manager', 'agent'];
        const finalRole = allowedRoles.includes(role) ? role : 'agent';

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: finalRole
        });

        res.status(201).json({
            success: true,
            message: "User registered successfully!",
            userId: user._id
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error during registration", error: error.message });
    }
};

// 2. LOGIN USER
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        const token = generateToken(user);

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error during login", error: error.message });
    }
};

// 3. GET ALL USERS (Admin Only)
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json({ success: true, count: users.length, users });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching users", error: error.message });
    }
};

// 4. UPDATE USER ROLE (Admin Only)
exports.updateRole = async (req, res) => {
    try {
        const { role } = req.body;
        const allowedRoles = ['admin', 'manager', 'agent'];

        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role specified" });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({ success: true, message: "Role updated successfully!", user });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating role", error: error.message });
    }
};