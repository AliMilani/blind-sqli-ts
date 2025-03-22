const asciiTable: string[] = Array.apply(null, Array(256)).map((_, index) => {
  return String.fromCharCode(index);
});
console.log(asciiTable.length);

const hiddenWord = "ali82!315152*(d";

function findCharacterAt(index: number): string {
  let lowerBound = 0;
  let upperBound = asciiTable.length - 1;

  while (upperBound >= lowerBound) {
    console.log("checking ", upperBound, lowerBound);
    const targetChar = hiddenWord[index];
    if (targetChar === undefined) throw new Error("Invalid index");
    const targetCharCode = targetChar.charCodeAt(0);

    if (upperBound == targetCharCode) return String.fromCharCode(upperBound);
    if (lowerBound == targetCharCode) return String.fromCharCode(lowerBound);

    const mid: number = lowerBound + Math.floor((upperBound - lowerBound) / 2);

    if (mid == targetCharCode) return String.fromCharCode(mid);

    if (mid > targetCharCode) {
      upperBound = mid - 1;
    } else {
      lowerBound = mid + 1;
    }
  }
  throw new Error("Character not found");
}

const main = () => {
  const hiddenWordLength = hiddenWord.length;
  let discoveredWord = "";

  Array.apply(null, Array(hiddenWordLength)).map((_: unknown, i: number) => {
    const character = findCharacterAt(i);
    discoveredWord = discoveredWord + character;
  });

  if (discoveredWord == hiddenWord) console.log("Success:", discoveredWord);
  else throw new Error("Failed to find the word");
};

main();
