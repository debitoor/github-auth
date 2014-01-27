# github-auth

A middleware for github authentication.

## Usage

You can use the middleware on a connect/express app like this.

```js
githubAuth = require('github-auth');

var config = {
	team: 'some-team',
	organization: 'my-company'
};
app.use(githubAuth('github app id', 'github app secret', config));
```
That will validate that the user belongs to the 'some-team' team of the 'my-company' organization on github.

You can also use a whitelist of users, like this.
```js
githubAuth = require('github-auth');

var config = {
	users: ['sorribas', 'mafintosh', 'octocat']
};
app.use(githubAuth('github app id', 'github app secret', config));
```

Also, you don't have to use this module with connect or express. You could just use it in your
regular node http server like this.

```js

http.createServer(funcition(request, response) {
	var config = {
		team: 'some-team',
		organization: 'my-company'
	};
	githubAuth('github app id', 'github app secret', config)(request, response, function(err) {
		if(!err) return response.end(err);

		// your http code here
	});
});

```
