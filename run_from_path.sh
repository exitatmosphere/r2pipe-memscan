#!/bin/bash

export R2PIPE_MEMSCAN=$PWD

cd $1

npx tsx "${R2PIPE_MEMSCAN}/src/index.ts" "$2"