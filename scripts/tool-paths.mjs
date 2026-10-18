// Development/build hosts are macOS or Linux (Windows uses WSL), as do CI and EAS.
// Keep system executables independent of caller-supplied PATH entries.
export const GIT = '/usr/bin/git';
export const SHELL = '/bin/bash';
