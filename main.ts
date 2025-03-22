const hiddenWord = "1ali82!31~5A@1awakdjawpjpda!91201u4-adkwÿjwjp52*(d";

let httpReqCount = 0; //

const MIN_PRINTABLE_ASCII = 32;

function findCharacterAt(index: number): string {
  let lowerBound = MIN_PRINTABLE_ASCII;
  let upperBound = 255;

  while (lowerBound < upperBound) {
    const mid = Math.floor((lowerBound + upperBound) / 2);
    if (hiddenWord[index] == undefined) throw new Error("Index out of bounds");
    const targetCharCode = hiddenWord[index].charCodeAt(0);

    const isGreater = targetCharCode > mid;
    httpReqCount++;

    if (isGreater) lowerBound = mid + 1;
    else upperBound = mid;
  }

  return String.fromCharCode(lowerBound);
}

(() => {
  const hiddenWordLength = hiddenWord.length;
  let discoveredWord = "";

  Array.apply(null, Array(hiddenWordLength)).map((_: unknown, i: number) => {
    const character = findCharacterAt(i);
    discoveredWord = discoveredWord + character;
  });

  if (discoveredWord == hiddenWord)
    console.log("Success:", discoveredWord, { httpReqCount });
  else throw new Error("Failed to find the word");
})();
