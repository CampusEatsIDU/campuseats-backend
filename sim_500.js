require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const jwt = require('jsonwebtoken');

const server = app.listen(0, () => {
    const port = server.address().port;
    const token = jwt.sign({ id: 9, role: 'superadmin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

    // Create random small image mock
    const fileContent = Buffer.alloc(100, 0);
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';

    let body = '';
    body += '--' + boundary + '\r\n';
    body += 'Content-Disposition: form-data; name="front_image"; filename="f.jpg"\r\n';
    body += 'Content-Type: image/jpeg\r\n\r\n';
    body += fileContent.toString('binary') + '\r\n';

    body += '--' + boundary + '\r\n';
    body += 'Content-Disposition: form-data; name="back_image"; filename="b.jpg"\r\n';
    body += 'Content-Type: image/jpeg\r\n\r\n';
    body += fileContent.toString('binary') + '\r\n';
    body += '--' + boundary + '--\r\n';

    const req = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/verification/submit',
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'multipart/form-data; boundary=' + boundary,
            'Content-Length': Buffer.byteLength(body, 'binary')
        }
    }, res => {
        let responseBody = '';
        res.on('data', c => responseBody += c);
        res.on('end', () => {
            console.log('STATUS:', res.statusCode);
            console.log('BODY:', responseBody);
            server.close();
            process.exit(0);
        });
    });

    req.write(body, 'binary');
    req.end();
});
