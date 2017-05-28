<h1 align="center">
  <br>
  <a href="https://github.com/HR/Badged"><img src="https://raw.githubusercontent.com/HR/badged/master/public/badged_logo.png" alt="Badged" width="180" style= "margin-bottom: 1rem"></a>
  <br>
  Badged
  <br>
  <br>
</h1>


<h4 align="center">Customizable GitHub Release download count badges</h4>

<p align="center">
  <a href="https://github.com/HR/Crypter">
    <img src="https://badged.space/HR/Crypter?badge=https://img.shields.io/badge/Crypter%20downloads-%s-orange.svg"
      alt="Downloads">
  </a>
  <a href="https://github.com/atom/atom">  
    <img src="https://badged.space/atom/atom?badge=https://img.shields.io/badge/Atom%20downloads-%s-green.svg"
      alt="Downloads">
  </a>
  <a href="https://github.com/electron/electron">  
    <img src="https://badged.space/electron/electron?badge=https://img.shields.io/badge/Electron%20downloads-%s-blue.svg"
      alt="Downloads">
  </a>
</p>
<br>


A service that provides you with a customizable download count badges for your
GitHub Releases like
[![downloads](https://badged.space/HR/Crypter?badge=https://img.shields.io/badge/downloads-%s-orange.svg)](https://github.com/HR/Crypter).
Allows you to keep track of your release downloads and let others know how
popular your releases are. Use virtually any badge service (e.g. shields.io) you
like! Uses GitHub API :octocat:, Mongodb 🌱, Koa ⚡ and ES17 ✨. Available for
free.

## Features
- Get a shiny downloads badge to add to your projects' README.md
- Pretty-printed download count
- Get downloads badge for a specific release by
  - Id
  - Tag
- Get all-time (total) download count of all your releases
- Use any badge service of your choice (with any customization offered)

## Usage
### Get downloads badge for latest release
```
https://badged.space/:username/:repo
```
Where `username` and `repo` are the GitHub username and repository respectively.
By default, it sends the shields.io download badge (i.e.
`https://img.shields.io/badge/downloads-${DOWNLOAD_COUNT}-green.svg`). However
you can specify a custom badge URI.

More coming soon...

## License
The MIT License (MIT)

Copyright (c) Habib Rehman (https://git.io/HR)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished todo so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
