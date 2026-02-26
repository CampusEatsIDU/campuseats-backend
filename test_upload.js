const request = require('supertest');
const express = require('express');
const app = require('./src/app');
const pool = require('./src/config/db');
const jwt = require('jsonwebtoken');

(async () => {
    // Generate valid jwt token for admin
    const token = jwt.sign({ id: 9, role: 'superadmin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

    // Create an empty image buffer
    const buf = Buffer.alloc(10);

    // Attempt request
    const res = await request(app)
        .post('/api/verification/submit')
        .set('Authorization', 'Bearer ' + token)
        .attach('front_image', buf, 'front.jpg')
        .attach('back_image', buf, 'back.jpg');

    console.log("Response status:", res.status);
    console.log("Response body:", res.body);

    pool.end();
})();
