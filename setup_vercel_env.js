const { execSync } = require('child_process');

const envVars = {
    DATABASE_URL: 'postgresql://juratbek:Messi0105@postgresql-juratbek.alwaysdata.net:5432/juratbek_odoo_db',
    JWT_SECRET: 'super_strong_secret_key_2026',
    NODE_ENV: 'production',
    TELEGRAM_BOT_TOKEN: '8280763848:AAFpUCja2kF0dyatui49TmYGYYTGuPKJr7c',
    TELEGRAM_GROUP_ID: '-1003714441392'
};

const fs = require('fs');

for (const [key, value] of Object.entries(envVars)) {
    // Write value to temp file without trailing newline
    const tmpFile = 'd:\\campuseats-backend\\tmp_env_val.txt';
    fs.writeFileSync(tmpFile, value, { encoding: 'utf8' });

    try {
        const cmd = `Get-Content "${tmpFile}" -Raw | npx vercel env add ${key} production`;
        execSync(cmd, {
            cwd: 'd:\\campuseats-backend',
            shell: 'powershell.exe',
            stdio: 'pipe'
        });
        console.log(`✅ Added ${key}`);
    } catch (err) {
        console.error(`❌ Failed ${key}: ${err.message.substring(0, 100)}`);
    }
}

// Cleanup
try { fs.unlinkSync('d:\\campuseats-backend\\tmp_env_val.txt'); } catch (e) { }

console.log('\nDone! Now redeploy to apply.');
