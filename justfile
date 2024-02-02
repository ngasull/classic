default: npm

npm:
	deno run -A script/build_npm.ts

test:
	deno test

clean:
	rm -rf npm
