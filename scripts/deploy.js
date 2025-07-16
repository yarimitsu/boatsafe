const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Run build first
  console.log('Building project...');
  execSync('npm run build', { stdio: 'inherit' });
  
  // Check if we're in a git repository
  try {
    execSync('git status', { stdio: 'pipe' });
  } catch {
    throw new Error('Not a git repository. Please initialize git first.');
  }
  
  // Check if gh-pages branch exists
  let branchExists = false;
  try {
    execSync('git show-ref --verify --quiet refs/heads/gh-pages', { stdio: 'pipe' });
    branchExists = true;
  } catch {
    console.log('Creating gh-pages branch...');
  }
  
  // Save current branch
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  
  if (!branchExists) {
    // Create orphan gh-pages branch
    execSync('git checkout --orphan gh-pages', { stdio: 'inherit' });
    execSync('git rm -rf .', { stdio: 'inherit' });
  } else {
    // Switch to existing gh-pages branch
    execSync('git checkout gh-pages', { stdio: 'inherit' });
    execSync('git rm -rf .', { stdio: 'inherit' });
  }
  
  // Copy build files
  const buildDir = path.join(__dirname, '../dist');
  const files = fs.readdirSync(buildDir);
  
  files.forEach(file => {
    const srcPath = path.join(buildDir, file);
    const destPath = path.join(process.cwd(), file);
    
    if (fs.statSync(srcPath).isDirectory()) {
      execSync(`cp -r "${srcPath}" "${destPath}"`, { stdio: 'inherit' });
    } else {
      execSync(`cp "${srcPath}" "${destPath}"`, { stdio: 'inherit' });
    }
  });
  
  // Add CNAME file if needed (optional)
  // fs.writeFileSync('CNAME', 'bightwatch.com');
  
  // Commit and push
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "Deploy to GitHub Pages"', { stdio: 'inherit' });
  execSync('git push origin gh-pages', { stdio: 'inherit' });
  
  // Return to original branch
  execSync(`git checkout ${currentBranch}`, { stdio: 'inherit' });
  
  console.log('Successfully deployed to GitHub Pages!');
  console.log('Your site will be available at: https://yourusername.github.io/bight-watch/');
  
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exit(1);
}