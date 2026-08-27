const { execSync } = require('child_process');
try {
  const result = require('child_process').execSync('npx tsc --noEmit', { 
    cwd: 'C:\\Users\\fateh\\Downloads\\accenture_hackathon\\trace-app',
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10
  });
  console.log(result.toString());
} catch (e) {
  console.log(e.stdout || e.message);
}