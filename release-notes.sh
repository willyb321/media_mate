git log --pretty=format:'* %s (%h)' $(git describe --tags --abbrev=0)..HEAD > ./build/release-notes.md
