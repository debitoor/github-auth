var root = require('root');
var github = require('github-auth');
var app = root();

var gh = github('blah', 'blehbleh', {
  users: ['sorribas']
});

app.get('/login', gh.login);

app.all('*', gh.authenticate);
app.all('*', function(req, res, next) {
  if (!req.github) return res.send('<a href="/login">Please login</a>');
  if (!req.github.authenticated) return res.send('You shall not pass');
  next();
});

app.get('/', function(req, res) {
  res.send('<h2>Hello World!</h2>');
});

app.listen(3000);
