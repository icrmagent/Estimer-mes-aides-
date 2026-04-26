import 'dotenv/config'
import jwt from 'jsonwebtoken'

const token = jwt.sign(
  { role: 'crm', iat: Math.floor(Date.now() / 1000) },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
)

console.log('CRM JWT Token (valide 24h) :')
console.log(token)
console.log('\nUsage :')
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/submissions?synced=false`)
