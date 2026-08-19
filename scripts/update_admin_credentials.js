try { require('dotenv').config(); } catch (e) {}
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ ERROR: DATABASE_URL environment variable is not set.');
  console.error('Please configure DATABASE_URL in your .env file or provide it when running the script:');
  console.error('Example: DATABASE_URL=postgresql://... node scripts/update_admin_credentials.js <username> <new_password>\n');
  process.exit(1);
}

const args = process.argv.slice(2);
const newUsername = args[0] || process.env.ADMIN_USERNAME || 'admin';
const newPassword = args[1] || process.env.ADMIN_PASSCODE;

if (!newPassword) {
  console.error('❌ ERROR: Please provide the new admin password.');
  console.log('\nUsage:');
  console.log('  node scripts/update_admin_credentials.js <new_username> <new_password>');
  console.log('\nExample:');
  console.log('  node scripts/update_admin_credentials.js myadmin StrongPass@2026\n');
  process.exit(1);
}

async function updateAdmin() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('render.com') || databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log(`\n⏳ Connecting to PostgreSQL database...`);
    const client = await pool.connect();

    console.log(`🔒 Generating secure Bcrypt hash for new password...`);
    const passwordHash = await bcrypt.hash(String(newPassword).trim(), 10);

    // Check if any admin exists
    const check = await client.query(`SELECT id, username FROM admins LIMIT 1`);

    if (check.rows.length > 0) {
      // Update existing admin
      const adminId = check.rows[0].id;
      await client.query(
        `UPDATE admins SET username = $1, password_hash = $2, status = 'ACTIVE' WHERE id = $3`,
        [newUsername.trim(), passwordHash, adminId]
      );
      console.log(`\n✅ SUCCESS! Admin credentials updated in PostgreSQL database:`);
      console.log(`-----------------------------------------------------`);
      console.log(`👤 Admin Username: ${newUsername.trim()}`);
      console.log(`🔑 Admin Password: (Updated successfully and hashed with Bcrypt)`);
      console.log(`-----------------------------------------------------\n`);
    } else {
      // Insert new admin
      await client.query(
        `INSERT INTO admins (username, password_hash, role, status) VALUES ($1, $2, 'admin', 'ACTIVE')`,
        [newUsername.trim(), passwordHash]
      );
      console.log(`\n✅ SUCCESS! New Admin account created in PostgreSQL database:`);
      console.log(`-----------------------------------------------------`);
      console.log(`👤 Admin Username: ${newUsername.trim()}`);
      console.log(`🔑 Admin Password: (Created successfully and hashed with Bcrypt)`);
      console.log(`-----------------------------------------------------\n`);
    }

    client.release();
    await pool.end();
  } catch (err) {
    console.error('❌ Failed to update admin in database:', err.message);
    process.exit(1);
  }
}

updateAdmin();
