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
    <img src="https://badged.co/HR/Crypter?badge=https://img.shields.io/badge/Crypter%20downloads-%s-orange.svg?style=flat-square"
      alt="Downloads">
  </a>
  <a href="https://github.com/atom/atom">
    <img src="https://badged.co/atom/atom?badge=https://img.shields.io/badge/Atom%20downloads-%s-green.svg?style=flat-square"
      alt="Downloads">
  </a>
  <a href="https://github.com/electron/electron">
    <img src="https://badged.co/electron/electron?badge=https://img.shields.io/badge/Electron%20downloads-%s-blue.svg?style=flat-square"
      alt="Downloads">
  </a>
</p>
<br>


A service that provides you with a customizable download count badges for your
GitHub Releases. Allows you to keep track of your release downloads and let
others know how popular your releases are. Use virtually any badge service (e.g.
shields.io) you like! Uses GitHub API, Mongodb 🌱, Koa ⚡ and ES17 ✨.
Available for free.

## Features
- Get a shiny downloads badge to add to your projects' README.md
- Pretty-printed download count
- Get downloads badge for a specific release by
  - Id
  - Tag
- Get all-time (total) download count of all your releases
- Use any badge service of your choice (with any customization offered)
- Highly scalable service (see Scalability)

## Scalability
All downloads are updated at an interval of an hour so as to stay within the
GitHub API request limit and increase scalability. Updates are request-driven
meaning that download counts are only updated after the interval if the badge is
requested. Furthermore, advanced caching is used to ensure only modified data is
updated via conditional requests which also reduces API quota usage and
increases scalability.

## Usage
Using the Badged API is pretty simple, just form the badged link for the desired
repo badge and use it as the source of an image element.

HTML
```html
<img src="https://badged.co/HR/Crypter" alt="Downloads badge">
```
Markdown
```markdown
![Downloads badge](https://badged.co/HR/Crypter)
```

### Base url
The base url for all downloads badges is
```
https://badged.co/:username/:repo
```
Where `username` and `repo` are the GitHub username and repository respectively.

### Get downloads badge for latest release
```
https://badged.co/:username/:repo
```
By default, the base url yields a badge for latest release

### Get downloads badge for a release by id
```
https://badged.co/:username/:repo/:id
```
Where `id` is the GitHub Release id.

### Get downloads badge for a release by tag name
```
https://badged.co/:username/:repo/tags/:tag
```
Where `tag` is the GitHub Release tag name.

### Get downloads badge for all releases
```
https://badged.co/:username/:repo/total
```
The latest total download count for all releases is calculated when requested.

### Specifying a custom badge
By default, the shields.io downloads badge (i.e.
`https://img.shields.io/badge/downloads-${DOWNLOAD_COUNT}-green.svg`) with the
calculated download count is sent as the response.

However, you can specify a custom badge URI _for any badge_ via the `badge`
parameter. The badge URI must include the `%s` substitution character, which
badged substitutes with the calculated download count (Pretty-printed), to yield
the correct downloads badge. E.g. if the download count is 1293 and the badge
URI is `https://img.shields.io/badge/downloads-%s-red.svg` yields the badge
`https://img.shields.io/badge/downloads-1,293-red.svg`

### Examples
- Downloads badge for the latest release `https://badged.co/HR/Crypter`
- Custom downloads badge for the latest release
- `https://badged.co/HR/Crypter?badge=https://img.shields.io/badge/downloads-%s-red.svg`
- Downloads badge for release by id `https://badged.co/HR/Crypter/5163582`
- Downloads badge for release by tag `https://badged.co/HR/Crypter/tags/v3.0.0`
- Downloads badge for all releases `https://badged.co/HR/Crypter/total`

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
