import fs from "fs";
import readline from "readline";
import { R2Pipe } from "r2pipe-promise";
import { changeEndianness, sleep, validateUint32 } from "./utils";
import {
  uint32Bytes,
  question,
  SIGTERM,
  initProcWaitTimeSec,
  R2_DUMP_FILE,
  SU_FILE,
  LOCAL_FOLDER,
  SU_CHANGE,
  SU_PREV_FILE,
  SU_TEMP_FILE,
  MAX_LINES_BEFORE_WRITE,
} from "./constants";

let searchFoundAddresses: string[] = [];

async function processReadValue(r2: R2Pipe, addr: string) {
  await r2.cmd(`y ${uint32Bytes} ${addr}`);
  const yankedData = await r2.cmd("y");
  const yankedValue = yankedData.split(" ", 3)[2].replace("\n", "");
  const yankedValueFormatted = BigInt(`0x${changeEndianness(yankedValue)}`);
  console.log(`${yankedValueFormatted}`);
}

async function processWriteValue(r2: R2Pipe, addr: string, value: string) {
  const valueToWrite = validateUint32(value);

  if (valueToWrite === -1) {
    console.log("Incorrect number to write");
  } else {
    await r2.cmd(`wv${uint32Bytes} ${valueToWrite} @ ${addr}`);
    console.log(`Wrote value ${valueToWrite} to address ${addr}`);
  }
}

async function processSearchForUnknownValue(
  r2: R2Pipe,
  addrRange: string[],
  changeFromPrev?: SU_CHANGE
) {
  if (changeFromPrev) {
    if (!fs.existsSync(SU_FILE)) {
      console.log("No previous found values to filter");
      return;
    } else {
      fs.renameSync(SU_FILE, SU_PREV_FILE);
      console.log(`Copied previous values to file '${SU_PREV_FILE}'`);
    }
  }

  if (!fs.existsSync(LOCAL_FOLDER)) {
    fs.mkdirSync(LOCAL_FOLDER);
  }

  const amountBytes = (BigInt(addrRange[1]) - BigInt(addrRange[0])).toString();

  await r2.cmd(`s ${addrRange[0]}`);
  await r2.cmd(`wtf ${R2_DUMP_FILE} ${amountBytes}`);

  const readStream = fs.createReadStream(R2_DUMP_FILE);
  fs.writeFileSync(SU_FILE, "");

  let addrStart = BigInt(addrRange[0]);

  for await (const chunk of readStream) {
    const chunkSize = (chunk as Buffer).length;
    let chunkToWrite = "";

    for (let offset = 0; offset < chunkSize; offset += uint32Bytes) {
      const addr = addrStart + BigInt(offset);
      const value = BigInt(
        `0x${changeEndianness(
          (chunk as Buffer)
            .subarray(offset, offset + uint32Bytes)
            .toString("hex")
        )}`
      );
      chunkToWrite += `0x${addr.toString(16)} ${value}\n`;
    }

    fs.appendFileSync(SU_FILE, chunkToWrite, "utf-8");
    addrStart += BigInt(chunkSize);
  }

  console.log(`Saved all current values to file '${SU_FILE}'`);

  if (changeFromPrev) {
    fs.writeFileSync(SU_TEMP_FILE, "");
    console.log(`Using ${SU_TEMP_FILE} to temporarily store filtered values`);

    const prevValuesStream = fs.createReadStream(SU_PREV_FILE);
    const currentValuesStream = fs.createReadStream(SU_FILE);

    const prevValuesRl = readline.createInterface({
      input: prevValuesStream,
      crlfDelay: Infinity,
    });
    const currentValuesRl = readline.createInterface({
      input: currentValuesStream,
      crlfDelay: Infinity,
    });

    const prevValuesIterator = prevValuesRl[Symbol.asyncIterator]();
    const currentValuesIterator = currentValuesRl[Symbol.asyncIterator]();

    let newContents = "";
    let lineAmount = 0;

    while (true) {
      const prevValuesIteratorNext = await prevValuesIterator.next();

      if (prevValuesIteratorNext.done) {
        fs.appendFileSync(SU_TEMP_FILE, newContents, "utf-8");
        break;
      }

      const prevLine = prevValuesIteratorNext.value;
      const prevLineAsArray = prevLine.split(" ", 2);

      while (true) {
        const currentValuesIteratorNext = await currentValuesIterator.next();

        if (currentValuesIteratorNext.done) {
          console.log("Current values ended before previous values");
          break;
        }

        const currentLine = currentValuesIteratorNext.value;
        const currentLineAsArray = currentLine.split(" ", 2);

        if (currentLineAsArray[0] === prevLineAsArray[0]) {
          const prevValue = BigInt(prevLineAsArray[1]);
          const currentValue = BigInt(currentLineAsArray[1]);

          if (
            (changeFromPrev === SU_CHANGE.UP && currentValue > prevValue) ||
            (changeFromPrev === SU_CHANGE.DOWN && currentValue < prevValue) ||
            (changeFromPrev === SU_CHANGE.SAME && currentValue === prevValue)
          ) {
            newContents += `${currentLine}\n`;
            lineAmount++;
          }

          break;
        }
      }

      if (lineAmount >= MAX_LINES_BEFORE_WRITE) {
        fs.appendFileSync(SU_TEMP_FILE, newContents, "utf-8");
        newContents = "";
        lineAmount = 0;
      }
    }

    fs.rmSync(SU_PREV_FILE);
    fs.rmSync(SU_FILE);
    fs.renameSync(SU_TEMP_FILE, SU_FILE);
    console.log(`Copied filtered values to ${SU_FILE}`);
  }
}

async function processSearchForValue(
  r2: R2Pipe,
  value: string,
  usePrev: boolean
) {
  if (usePrev && searchFoundAddresses.length == 0) {
    console.log("No previous found values to filter");
    return;
  }

  const valueToSearchFor = validateUint32(value);

  if (valueToSearchFor === -1) {
    console.log("Incorrect number to search for");
  } else {
    const valueToSearchForAsHexStr = valueToSearchFor.toString(16);
    const valueToSearchForAsHexStrPadded =
      "0".repeat(uint32Bytes * 2 - valueToSearchForAsHexStr.length) +
      valueToSearchForAsHexStr;
    const valueToSearchForFormatted = changeEndianness(
      valueToSearchForAsHexStrPadded
    );
    console.log(
      `Searching for value: ${valueToSearchFor} (formatted as ${valueToSearchForFormatted})`
    );

    const searchRes = await r2.cmd(
      `:/v${uint32Bytes} ${valueToSearchForFormatted}`
    );
    const searchResLines = searchRes.split("\n");
    const searchFoundAddressesLocal: string[] = [];
    for (const searchResLine of searchResLines) {
      if (searchResLine.startsWith("0x")) {
        searchFoundAddressesLocal.push(searchResLine.split(" ", 1)[0]);
      }
    }

    if (!usePrev) {
      searchFoundAddresses = searchFoundAddressesLocal;
    } else {
      searchFoundAddresses = searchFoundAddresses.filter((addr) =>
        searchFoundAddressesLocal.includes(addr)
      );
    }

    console.log("Found addresses with value:");
    console.log("-------------------");
    searchFoundAddresses.forEach((addr) => console.log(addr));
    console.log("-------------------");
  }
}

async function processInput(r2: R2Pipe, addrRange: string[]): Promise<boolean> {
  const input = await question("> ");

  const inputArgs = input.split(" ");

  if (inputArgs.length === 1) {
    if (inputArgs[0] === "?") {
      console.log("? - Show this message");
      console.log("q - Detach from process");
      console.log(
        "qq - Detach from process, terminate process and clean temporary files"
      );
      console.log("s [value(uint32)] - Search for value from scratch");
      console.log(
        "sc [value(uint32)] - Search for value using previously found addresses"
      );
      console.log("su - Search for unknown value(uint32) from scratch");
      console.log(
        `su${SU_CHANGE.UP} - Search for unknown value(uint32) ${SU_CHANGE.UP} than previous`
      );
      console.log(
        `su${SU_CHANGE.DOWN} - Search for unknown value(uint32) ${SU_CHANGE.DOWN} than previous`
      );
      console.log(
        `su${SU_CHANGE.SAME} - Search for unknown value(uint32) ${SU_CHANGE.SAME} than previous`
      );
      console.log("r [addr(0x...)] - Read value(uint32) from address");
      console.log("w [addr(0x...)] [value(uint32)] - Write value to address");
      console.log(
        "esr [startAddr(0x...)] [endAddr(0x...)] - Set address range to search in"
      );
    } else if (inputArgs[0] === "q") {
      return false;
    } else if (inputArgs[0] === "qq") {
      await onFullQuit(r2);
      return false;
    } else if (inputArgs[0] === "su") {
      await processSearchForUnknownValue(r2, addrRange);
    } else if (inputArgs[0] === `su${SU_CHANGE.UP}`) {
      await processSearchForUnknownValue(r2, addrRange, SU_CHANGE.UP);
    } else if (inputArgs[0] === `su${SU_CHANGE.DOWN}`) {
      await processSearchForUnknownValue(r2, addrRange, SU_CHANGE.DOWN);
    } else if (inputArgs[0] === `su${SU_CHANGE.SAME}`) {
      await processSearchForUnknownValue(r2, addrRange, SU_CHANGE.SAME);
    } else {
      console.log("Unknown command");
    }
  } else if (inputArgs.length === 2) {
    if (inputArgs[0] === "s") {
      await processSearchForValue(r2, inputArgs[1], false);
    } else if (inputArgs[0] === "sc") {
      await processSearchForValue(r2, inputArgs[1], true);
    } else if (inputArgs[0] === "r") {
      await processReadValue(r2, inputArgs[1]);
    } else {
      console.log("Unknown command");
    }
  } else if (inputArgs.length === 3) {
    if (inputArgs[0] === "w") {
      await processWriteValue(r2, inputArgs[1], inputArgs[2]);
    } else if (inputArgs[0] === "esr") {
      await setAddrRange(r2, inputArgs[1], inputArgs[2]);
    } else {
      console.log("Unknown command");
    }
  } else {
    console.log("Unknown command");
  }

  return true;
}

async function onFullQuit(r2: R2Pipe) {
  console.log("Cleaning up temporary files");
  fs.rmSync(LOCAL_FOLDER, { recursive: true, force: true });

  console.log("Terminating process");
  await r2.cmd(`:dk ${SIGTERM}`);
}

function getAddrRange(procPid: string, type: "stack" | "heap") {
  const procMapsFilePath = `/proc/${procPid}/maps`;
  const procMapsFileContent = fs.readFileSync(procMapsFilePath, "utf-8");

  const procMapsFileLines = procMapsFileContent.split("\n");

  let procMapsLine;
  for (const procMapsFileLine of procMapsFileLines) {
    if (procMapsFileLine.includes(`[${type}]`)) {
      procMapsLine = procMapsFileLine;
      break;
    }
  }
  if (!procMapsLine) throw new Error(`${type} was not found`);

  const addrRange = procMapsLine
    .split(" ", 1)[0]
    .split("-", 2)
    .map((addr) => `0x${addr}`);

  return addrRange;
}

async function setAddrRange(r2: R2Pipe, start: string, end: string) {
  await r2.cmd(`:e search.from=${start}`);
  await r2.cmd(`:e search.to=${end}`);
  console.log(`Set search address range as ${start}-${end}`);
}

async function main() {
  const args = process.argv.slice(2);

  let path: string;
  if (args.length == 1) {
    path = args[0];
  } else if (args.length == 2) {
    path = `attach/${args[0]}`;
  } else {
    throw new Error("Incorrect amount of arguments");
  }

  const r2 = await (R2Pipe.open(
    `frida://${path}`
  ) as unknown as Promise<R2Pipe>);

  // await r2.cmd(`e bin.relocs.apply=true`);
  // console.log("Running analyzer...");
  // await r2.cmd("aaa");

  await r2.cmd("dc");

  console.log(`Waiting for ${initProcWaitTimeSec} sec for process to init...`);
  await sleep(initProcWaitTimeSec * 1000);

  const childPid = (await r2.cmd(":dp")).replace("\n", "");
  console.log(`Process id: ${childPid}`);

  const stackAddrRange = getAddrRange(childPid, "stack");
  console.log(`Stack located in: ${stackAddrRange[0]}-${stackAddrRange[1]}`);

  const heapAddrRange = getAddrRange(childPid, "heap");
  console.log(`Heap located in: ${heapAddrRange[0]}-${heapAddrRange[1]}`);

  await r2.cmd(`:e search.align=4`);
  await setAddrRange(r2, stackAddrRange[0], stackAddrRange[1]);

  console.log("Opening command prompt, enter '?' to see available commands");
  while (true) {
    if (!(await processInput(r2, stackAddrRange))) break;
  }

  console.log("Exiting");
  await r2.quit();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
