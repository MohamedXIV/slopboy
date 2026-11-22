type LineChange = {kind:'added'|'removed'; line:number; text:string};

const maxCells = 1_000_000;
const maxChanges = 2_000;

export function compareSourceLines(before:string, after:string):LineChange[]|null {
  const lines = (source:string) => source === '' ? [] : source.split(/\r\n|\r|\n/);
  const oldLines = lines(before);
  const newLines = lines(after);
  let start = 0;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (start < oldEnd && start < newEnd && oldLines[start] === newLines[start]) start++;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd-1] === newLines[newEnd-1]) {
    oldEnd--;
    newEnd--;
  }

  const rows = oldEnd - start + 1;
  const columns = newEnd - start + 1;
  if (rows * columns > maxCells) return null;

  // Compute common subsequence lengths only within the changed middle.
  const common = new Uint32Array(rows * columns);
  for (let i=rows-2; i>=0; i--) {
    for (let j=columns-2; j>=0; j--) {
      const cell = i*columns+j;
      common[cell] = oldLines[start+i] === newLines[start+j]
        ? 1+common[cell+columns+1]
        : Math.max(common[cell+columns],common[cell+1]);
    }
  }

  const changes:LineChange[] = [];
  let i=0, j=0;
  while (i<rows-1 || j<columns-1) {
    if (i<rows-1 && j<columns-1 && oldLines[start+i] === newLines[start+j]) {
      i++;
      j++;
      continue;
    }
    if (changes.length === maxChanges) return null;
    const cell = i*columns+j;
    if (i<rows-1 && (j===columns-1 || common[cell+columns]>=common[cell+1])) {
      changes.push({kind:'removed',line:start+i+1,text:oldLines[start+i]});
      i++;
    } else {
      changes.push({kind:'added',line:start+j+1,text:newLines[start+j]});
      j++;
    }
  }
  return changes;
}
