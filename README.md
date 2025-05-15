# R2Pipe MemScan

Simple CheatEngine-like memory scanner on top of [r2pipe](https://github.com/radareorg/radare2-r2pipe) for Linux

## Prerequisites

- [radare2](https://github.com/radareorg/radare2)
- [r2frida](https://github.com/nowsecure/r2frida) plugin
- nodejs v16+

## Usage

```bash
# Install dependencies
npm i

# Spawn new process and attach
npm start /path/to/executable
npm start "/path/to/executable --arg" # or with args

# Attach to running process with pid
npm start 1234 -a
```