# [<img src="./browser/icon.png" width="40" align="left" alt="Equicord">](https://github.com/Equicord/Equicord) Equicord 2 (OMG!!! 2)

[![Equibop](https://img.shields.io/badge/Equibop-grey?style=flat)](https://github.com/Equicord/Equibop)
[![Tests](https://github.com/OMetaVR/Equicord/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/Equicord/Equicord/actions/workflows/test.yml)
[![Discord](https://img.shields.io/discord/1173279886065029291.svg?color=768AD4&label=Discord&logo=discord&logoColor=white)](https://equicord.org/discord)

Equicord is a fork of [Vencord](https://github.com/Vendicated/Vencord), with over 300+ plugins. This is my own public fork of that fork because I heard you like forks with your forks, so I forked your fork so I could fork plugins and add them to my fork.

You CANNOT join the equicord Discord server for commits, changes, chatting, or support. This is fully unofficial!!! If you ignore this warning, we will laugh at you!

### Included Plugins

Our included plugins can be found [here](https://equicord.org/plugins). You can also find a list of plugins for this specific fork at the end of this readme.

There are also going to be custom made plugins developed by myself, if any user wants to submit them to equicord or vencord, or refactor the code, you have my permission with the caveat that you add me to the author list and credit is given.

## Installing Equicord Devbuild

### Dependencies

[Git](https://git-scm.com/download) and [Node.JS LTS](https://nodejs.dev/en/) are required.

Install `pnpm`:

> :exclamation: This next command may need to be run as admin/root depending on your system, and you may need to close and reopen your terminal for pnpm to be in your PATH.

```shell
npm i -g pnpm
```

> :exclamation: **IMPORTANT** Make sure you aren't using an admin/root terminal from here onwards. It **will** mess up your Discord/Equicord instance and you **will** most likely have to reinstall.

Clone Equicord:

```shell
git clone https://github.com/OMetaVR/Equicord
cd Equicord
```

Install dependencies:

```shell
pnpm install --frozen-lockfile
```

Build Equicord:

```shell
pnpm build
```

Inject Equicord into your desktop client:

```shell
pnpm inject
```

Build Equicord for web:

```shell
pnpm buildWeb
```

After building Equicord's web extension, locate the appropriate ZIP file in the `dist` directory and follow your browser’s guide for installing custom extensions, if supported.

Note: Firefox extension zip requires Firefox for developers

## Credits

Thank you to [Vendicated](https://github.com/Vendicated) for creating [Vencord](https://github.com/Vendicated/Vencord) & [Suncord](https://github.com/verticalsync/Suncord) by [verticalsync](https://github.com/verticalsync) for helping when needed.

And thank you Equicord for the amazing work you've done on your own fork!

## Star History of Official Equicord (look at how cool they are!)

<a href="https://star-history.com/#Equicord/Equicord&Timeline">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Equicord/Equicord&type=Timeline&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Equicord/Equicord&type=Timeline" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Equicord/Equicord&type=Timeline" />
  </picture>
</a>

## Disclaimer

Discord is trademark of Discord Inc., and solely mentioned for the sake of descriptivity.
Mentioning it does not imply any affiliation with or endorsement by Discord Inc.
Vencord is not connected to Equicord and as such, all donation links go to Vendicated's donation link.

<details>
<summary>Using Equicord and thus this fork violates Discord's terms of service</summary>

Client modifications are against Discord’s Terms of Service.

However, Discord is pretty indifferent about them and there are no known cases of users getting banned for using client mods without malicious intent! So you should generally be fine if you don’t use plugins that implement abusive behaviour. But no worries, all inbuilt plugins are safe to use!

Regardless, if your account is essential to you and getting disabled would be a disaster for you, you should probably not use any client mods (not exclusive to Equicord), just to be safe.

Additionally, make sure not to post screenshots with Equicord (and any other clients) in a server where you might get banned for it.

</details>

## List of plugins added by this fork

<details>
<summary>Custom Plugins</summary>

| Name | Description | Original Repo |
|------|-------------|---------------|
| betterSpotifyCard | Enhanced Spotify card display | [git.nin0.dev](https://git.nin0.dev/userplugins/betterSpotifyCard) |
| spotifyLyrics | Add's lyrics display to the spotify controls above the user control panel | [github.com](https://github.com/Masterjoona/vc-spotifylyrics/)
| favoriteMedia | BetterDiscord fork for favoriting any type of media with categories within the expression picker | I created this, it has no repo |

</details>
