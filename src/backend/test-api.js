import http from 'http';

const token = process.argv[2];
const req = http.request('http://localhost:3000/api/enregistrements?borneId=5df6f4e0-b163-448d-81bb-c495509d3b27', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
}, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(res.statusCode, data));
});
req.end();
