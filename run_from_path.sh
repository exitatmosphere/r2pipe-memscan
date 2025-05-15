#!/bin/bash

export R2PIPE_MEMSCAN_PATH=$PWD

cd $1

npx tsx "${R2PIPE_MEMSCAN_PATH}/src/index.ts" "$2"