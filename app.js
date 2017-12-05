process.chdir(__dirname); // set working directory
process.on('unhandledRejection', console.log); // catch/log all rejections
const path = require("path"),
      simpleGit = require('simple-git/promise'),
      pm = require('promisemaker'),
      fs = require('fs'),
      exec = pm(require('child_process')).exec;


let repos = require('./repos.json');
async function fixJSON(){
  for (let i = 0; i < repos.length; ++i) {
    if (!repos[i].name) { console.log('no name specified for', repos[i]); }
    let fullPath = path.resolve(__dirname, "../" + repos[i].name);
    if (!fs.existsSync(fullPath)) {
      console.log('ERROR, folder:', fullPath, 'does not exist!');
      repos.splice(i--, 1);
      continue;
    }
    repos[i].bash && repos[i].bash.constructor != Array && (repos[i].bash = [ repos[i].bash ]);
    repos[i].path = fullPath;
    repos[i].repo = await simpleGit(fullPath);
    repos[i] = Object.assign({}, { branch: 'master', "npm install": true }, repos[i]);
  }
}


async function getCurrentBranch(r){
  return (await r.repo.branch()).current;
}

function log(r, text, result){
  console.log(text + ' in', r.name + '/' + r.branch +':', result);
}

async function fetch(r){
  const result = await r.repo.fetch('origin', r.branch);
  log(r, 'Fetch', result);
}

async function pull(r, currentBranch){
  if (r.branch != currentBranch) {
    await r.repo.checkout(r.branch);
  }
  const result = await r.repo.pull('origin', r.branch);
  delete result.insertions;
  delete result.deletions;

  const didChange = result.files && result.files.length;
  didChange && log(r, 'Pull', result);
  return didChange;
}

async function run(cmd, folder){
  await exec(cmd, {cwd: folder || __dirname}).catch((e)=>{
    console.log('Error running ', cmd, 'in folder', folder, '\n', e.message)
  });
}

async function update(r){
  const currBranch = await getCurrentBranch(r);

  const didPull = await pull(r, currBranch);

  if (currBranch != r.branch) {
    await r.repo.checkout(currBranch);
  }

  if(didPull) {
    if (r['npm install'])
      await run('npm i', r.path);

    if (r['bash'])
      for(let b of r['bash'])
        await run(b, r.path);

    if (r['pm2'] !== false) {
      console.log('Restarting', r.name, 'on branch:', currBranch);
      run('pm2 restart ' + (r['pm2'] || r.name) , r.path);
    }
  }
}



async function start(){
  await fixJSON();
  const logTime = false; // Edit this to see the duration of the actions.

  async function updateAll(){
    logTime && console.time('Updating repos');
    for(let r of repos) {
      await update(r);
    }
    logTime && console.timeEnd('Updating repos');

    setTimeout(updateAll, 60*1000);
  }

  updateAll();
}
start();
