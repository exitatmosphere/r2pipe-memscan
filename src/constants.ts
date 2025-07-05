import readline from "readline";

export const initProcWaitTimeSec = 1;

export const SIGTERM = 15;

export enum NUMBER_TYPES {
  UINT = "uint",
  INT = "int",
}

export const NUMBER_PROPS = {
  [NUMBER_TYPES.UINT]: {
    bytes: 4,
    limits: [0n, 4294967295n],
  },
  [NUMBER_TYPES.INT]: {
    bytes: 4,
    limits: [-2147483648n, 2147483647n],
  },
};

export const LOCAL_FOLDER = process.env.R2PIPE_MEMSCAN_PATH
  ? `${process.env.R2PIPE_MEMSCAN_PATH}/local`
  : "local";
export const R2_DUMP_FILE = `${LOCAL_FOLDER}/r2-dump.txt`;
export const SU_FILE = `${LOCAL_FOLDER}/su.txt`;
export const SU_PREV_FILE = `${LOCAL_FOLDER}/su-prev.txt`;
export const SU_TEMP_FILE = `${LOCAL_FOLDER}/su-temp.txt`;

export const MAX_LINES_BEFORE_WRITE = 1000;

export const enum SU_CHANGE {
  UP = ">",
  DOWN = "<",
  SAME = "=",
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
export const question = (question: string) => {
  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};
