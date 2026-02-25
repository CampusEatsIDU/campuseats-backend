const axios = require("axios");

const BASE_URL = "http://localhost:5000";

async function runTests() {
    try {
        // 1. Setup SuperAdmin Account
        await axios.post(`${BASE_URL}/api/auth/signup`, {
            phone: "+998900000000",
            password: "superpassword123",
            fullName: "Super Admin Test"
        }).catch(e => {
            if (e.response && e.response.status === 400) {
                console.log("SuperAdmin test user likely exists, ignoring...");
                return;
            }
            throw e;
        });

        // Make superadmin directly in DB just in case it's not setup yet
        const { Client } = require('pg');
        const client = new Client({ connectionString: process.env.DATABASE_URL || "postgresql://juratbek:Messi0105@postgresql-juratbek.alwaysdata.net:5432/juratbek_odoo_db" });
        await client.connect();
        await client.query("UPDATE users SET role = 'superadmin' WHERE phone = '+998900000000'");
        await client.end();

        // 2. Login SuperAdmin
        const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
            phone: "+998900000000",
            password: "superpassword123"
        });

        const token = loginRes.data.token;
        console.log("Logged in successfully, token received.");

        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        // 3. Test GET /api/admin/users
        const usersRes = await axios.get(`${BASE_URL}/api/admin/users`);
        console.log("Users fetched:", usersRes.data.total);

        // 4. Test Create Restaurant
        const restRes = await axios.post(`${BASE_URL}/api/admin/restaurants/create`, {
            phone: "+998901111111",
            restaurant_name: "Test Restaurant"
        }).catch(e => {
            if (e.response && e.response.status === 400 && e.response.data.message === "Phone already exists") {
                console.log("Restaurant already exists...");
                return { data: { message: "Existing" } };
            }
            throw e;
        });
        console.log("Create Restaurant response:", restRes.data.message);

        // 5. Test Audit Logs
        const auditRes = await axios.get(`${BASE_URL}/api/admin/audit`);
        console.log("Audit Logs fetched. Found counts:", auditRes.data.logs.length);

        console.log("All essential endpoints tested via Node successfully!");
    } catch (error) {
        if (error.response) {
            console.error("Test Error Response:", error.response.status, error.response.data);
        } else {
            console.error("Test Error:", error.message);
        }
    }
}

runTests();
