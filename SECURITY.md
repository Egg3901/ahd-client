# Security policy

## Reporting

Do not open a public issue for a vulnerability or game exploit.

Report privately through one of these channels:

- [GitHub private security advisory](https://github.com/Egg3901/ahd-client/security/advisories/new)
- Email `admin@ahousedividedgame.com`
- Direct message to an A House Divided staff member in Discord

Include the affected version and operating system, reproduction steps, and impact. Test with a local or sandbox game origin whenever possible.

## Security boundary

The client loads remote game content. Security-sensitive areas include navigation policy, trusted origins, the preload bridge, IPC validation, window creation, downloads, external URL handling, update metadata, persisted sessions, and any path that can expose Node or operating-system capability to page JavaScript.

Never include real session cookies, player data, or credentials in a report attachment.
