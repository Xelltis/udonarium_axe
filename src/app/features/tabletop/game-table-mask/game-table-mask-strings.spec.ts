import { GridType } from '@axe/domain/tabletop/game-table';
import {
  buildHexOuterBorderSvg,
  buildHexOutlineMask,
  buildMaskCss,
  BuildMaskCssParams,
  buildScratchedMaskCss,
  buildScratchingGridInfos,
} from '@axe/features/tabletop/game-table-mask/game-table-mask-helpers';
import { describe, expect, it } from 'vitest';

const GRID_TYPES = [
  { name: 'square', type: GridType.SQUARE },
  { name: 'flat', type: GridType.HEX_VERTICAL },
  { name: 'pointy', type: GridType.HEX_HORIZONTAL },
];
const HEX_TYPES = GRID_TYPES.filter(({ type }) => type !== GridType.SQUARE);
const MASK_SIZES: readonly (readonly [number, number])[] = [
  [1, 1],
  [3, 2],
  [5, 4],
];
const CELL_SIZES = [50, 37];

const SCRATCH_STATES: Record<string, Partial<BuildMaskCssParams>> = {
  untouched: { isNonScratched: true, isPreviewMode: false, scratchedGrids: '', scratchingGrids: '' },
  scratched: { isNonScratched: false, isPreviewMode: false, scratchedGrids: '1:0,0:1', scratchingGrids: '' },
  preview: { isNonScratched: false, isPreviewMode: true, scratchedGrids: '1:0,0:1', scratchingGrids: '2:1' },
  picking: {
    isNonScratched: false,
    isPreviewMode: false,
    scratchedGrids: '1:0',
    scratchingGrids: '',
    currentScratchingSet: new Set(['0:0', '1:0']),
  },
};

/** The length and a 32-bit FNV-1a hash of a string, enough to tell whether a long output changed at all. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}:${hash.toString(16).padStart(8, '0')}`;
}

function paramsFor(type: GridType, width: number, height: number, gridSize: number, state: string): BuildMaskCssParams {
  return {
    currentScratchingSet: null,
    gridSize,
    gridType: type,
    width,
    height,
    isNonScratched: true,
    isPreviewMode: false,
    scratchedGrids: '',
    scratchingGrids: '',
    ...SCRATCH_STATES[state],
  };
}

function everyShape(visit: (label: string, type: GridType, width: number, height: number, gridSize: number) => string) {
  const found: Record<string, string> = {};
  for (const { name, type } of GRID_TYPES) {
    for (const [width, height] of MASK_SIZES) {
      for (const gridSize of CELL_SIZES) {
        const label = `${name} ${width}x${height} @${gridSize}`;
        found[label] = visit(label, type, width, height, gridSize);
      }
    }
  }
  return found;
}

describe('the strings a mask is drawn from', () => {
  it('builds the same hex outline mask as before', () => {
    expect(
      everyShape((_, type, width, height, gridSize) => fingerprint(buildHexOutlineMask(gridSize, type, width, height)))
    ).toMatchInlineSnapshot(`
      {
        "flat 1x1 @37": "503:4e4d9a04",
        "flat 1x1 @50": "499:de98a89e",
        "flat 3x2 @37": "1747:c0b2300c",
        "flat 3x2 @50": "1746:fed29497",
        "flat 5x4 @37": "5233:1326b1f2",
        "flat 5x4 @50": "5220:2dad261e",
        "pointy 1x1 @37": "490:aa0efa7e",
        "pointy 1x1 @50": "516:cca71875",
        "pointy 3x2 @37": "1707:d8196927",
        "pointy 3x2 @50": "1725:97c88225",
        "pointy 5x4 @37": "5170:ef163051",
        "pointy 5x4 @50": "5216:5250d43c",
        "square 1x1 @37": "0:811c9dc5",
        "square 1x1 @50": "0:811c9dc5",
        "square 3x2 @37": "0:811c9dc5",
        "square 3x2 @50": "0:811c9dc5",
        "square 5x4 @37": "0:811c9dc5",
        "square 5x4 @50": "0:811c9dc5",
      }
    `);
  });

  it('builds the same hex outer border as before', () => {
    expect(
      everyShape((_, type, width, height, gridSize) =>
        fingerprint(buildHexOuterBorderSvg(gridSize, type, width, height))
      )
    ).toMatchInlineSnapshot(`
      {
        "flat 1x1 @37": "996:507b109f",
        "flat 1x1 @50": "992:6f4e857f",
        "flat 3x2 @37": "2349:264f7055",
        "flat 3x2 @50": "2336:dff825c0",
        "flat 5x4 @37": "4147:32da6483",
        "flat 5x4 @50": "4092:082a4230",
        "pointy 1x1 @37": "970:70e5bdb7",
        "pointy 1x1 @50": "962:4581a2e1",
        "pointy 3x2 @37": "2268:c1bec5d7",
        "pointy 3x2 @50": "2247:fec6408c",
        "pointy 5x4 @37": "4022:7be2a616",
        "pointy 5x4 @50": "3991:1dfde04c",
        "square 1x1 @37": "0:811c9dc5",
        "square 1x1 @50": "0:811c9dc5",
        "square 3x2 @37": "0:811c9dc5",
        "square 3x2 @50": "0:811c9dc5",
        "square 5x4 @37": "0:811c9dc5",
        "square 5x4 @50": "0:811c9dc5",
      }
    `);
  });

  it('builds the same mask css in every scratch state as before', () => {
    const found: Record<string, string> = {};
    for (const state of Object.keys(SCRATCH_STATES)) {
      const shapes = everyShape((_, type, width, height, gridSize) =>
        fingerprint(buildMaskCss(paramsFor(type, width, height, gridSize, state)))
      );
      for (const [label, value] of Object.entries(shapes)) found[`${state} ${label}`] = value;
    }
    expect(found).toMatchInlineSnapshot(`
      {
        "picking flat 1x1 @37": "503:4e4d9a04",
        "picking flat 1x1 @50": "499:de98a89e",
        "picking flat 3x2 @37": "1502:7c7dc431",
        "picking flat 3x2 @50": "1488:9f2ec3a4",
        "picking flat 5x4 @37": "4988:e4dcbb9b",
        "picking flat 5x4 @50": "4962:7acd82b1",
        "picking pointy 1x1 @37": "490:aa0efa7e",
        "picking pointy 1x1 @50": "516:cca71875",
        "picking pointy 3x2 @37": "1472:194b4b17",
        "picking pointy 3x2 @50": "1493:4e613120",
        "picking pointy 5x4 @37": "4935:f50c6d81",
        "picking pointy 5x4 @50": "4984:668c1a43",
        "picking square 1x1 @37": "59:69bb07fa",
        "picking square 1x1 @50": "59:a7e0d2e0",
        "picking square 3x2 @37": "299:acfb6558",
        "picking square 3x2 @50": "299:ba43e612",
        "picking square 5x4 @37": "1152:d5556e9c",
        "picking square 5x4 @50": "1152:db1edeb8",
        "preview flat 1x1 @37": "503:4e4d9a04",
        "preview flat 1x1 @50": "499:de98a89e",
        "preview flat 3x2 @37": "1019:85a71954",
        "preview flat 3x2 @50": "1011:09404296",
        "preview flat 5x4 @37": "4505:9c304da6",
        "preview flat 5x4 @50": "4485:b96f85ad",
        "preview pointy 1x1 @37": "490:aa0efa7e",
        "preview pointy 1x1 @50": "516:cca71875",
        "preview pointy 3x2 @37": "977:df72c42a",
        "preview pointy 3x2 @50": "1000:c74e7995",
        "preview pointy 5x4 @37": "4440:6ff67958",
        "preview pointy 5x4 @50": "4491:b15bcb06",
        "preview square 1x1 @37": "59:69bb07fa",
        "preview square 1x1 @50": "59:a7e0d2e0",
        "preview square 3x2 @37": "179:1cd55b68",
        "preview square 3x2 @50": "179:ca04b982",
        "preview square 5x4 @37": "1032:5b1d4dc4",
        "preview square 5x4 @50": "1032:b38daca0",
        "scratched flat 1x1 @37": "503:4e4d9a04",
        "scratched flat 1x1 @50": "499:de98a89e",
        "scratched flat 3x2 @37": "1268:e0e5775b",
        "scratched flat 3x2 @50": "1257:3e4804fe",
        "scratched flat 5x4 @37": "4754:023cf965",
        "scratched flat 5x4 @50": "4731:88cb2019",
        "scratched pointy 1x1 @37": "490:aa0efa7e",
        "scratched pointy 1x1 @50": "516:cca71875",
        "scratched pointy 3x2 @37": "1225:07363f40",
        "scratched pointy 3x2 @50": "1249:1fc45cfe",
        "scratched pointy 5x4 @37": "4688:fcf55d6a",
        "scratched pointy 5x4 @50": "4740:8b9c7cf9",
        "scratched square 1x1 @37": "59:69bb07fa",
        "scratched square 1x1 @50": "59:a7e0d2e0",
        "scratched square 3x2 @37": "239:f3c3b596",
        "scratched square 3x2 @50": "239:d3c330b0",
        "scratched square 5x4 @37": "1092:08e2b516",
        "scratched square 5x4 @50": "1092:d1ff8ac2",
        "untouched flat 1x1 @37": "503:4e4d9a04",
        "untouched flat 1x1 @50": "499:de98a89e",
        "untouched flat 3x2 @37": "1747:c0b2300c",
        "untouched flat 3x2 @50": "1746:fed29497",
        "untouched flat 5x4 @37": "5233:1326b1f2",
        "untouched flat 5x4 @50": "5220:2dad261e",
        "untouched pointy 1x1 @37": "490:aa0efa7e",
        "untouched pointy 1x1 @50": "516:cca71875",
        "untouched pointy 3x2 @37": "1707:d8196927",
        "untouched pointy 3x2 @50": "1725:97c88225",
        "untouched pointy 5x4 @37": "5170:ef163051",
        "untouched pointy 5x4 @50": "5216:5250d43c",
        "untouched square 1x1 @37": "0:811c9dc5",
        "untouched square 1x1 @50": "0:811c9dc5",
        "untouched square 3x2 @37": "0:811c9dc5",
        "untouched square 3x2 @50": "0:811c9dc5",
        "untouched square 5x4 @37": "0:811c9dc5",
        "untouched square 5x4 @50": "0:811c9dc5",
      }
    `);
  });

  it('builds the same scratched layer mask in every scratch state as before', () => {
    const found: Record<string, string> = {};
    for (const state of Object.keys(SCRATCH_STATES)) {
      const shapes = everyShape((_, type, width, height, gridSize) =>
        fingerprint(buildScratchedMaskCss(paramsFor(type, width, height, gridSize, state)))
      );
      for (const [label, value] of Object.entries(shapes)) found[`${state} ${label}`] = value;
    }
    expect(found).toMatchInlineSnapshot(`
      {
        "picking flat 1x1 @37": "0:811c9dc5",
        "picking flat 1x1 @50": "0:811c9dc5",
        "picking flat 3x2 @37": "503:31bb749e",
        "picking flat 3x2 @50": "514:54183c46",
        "picking flat 5x4 @37": "505:3a6fb150",
        "picking flat 5x4 @50": "514:46fcbfc2",
        "picking pointy 1x1 @37": "0:811c9dc5",
        "picking pointy 1x1 @50": "0:811c9dc5",
        "picking pointy 3x2 @37": "493:f480cbb7",
        "picking pointy 3x2 @50": "488:e0f62da6",
        "picking pointy 5x4 @37": "491:2ef5ff17",
        "picking pointy 5x4 @50": "488:e9355790",
        "picking square 1x1 @37": "0:811c9dc5",
        "picking square 1x1 @50": "0:811c9dc5",
        "picking square 3x2 @37": "59:7db4e053",
        "picking square 3x2 @50": "59:f0132b93",
        "picking square 5x4 @37": "59:7db4e053",
        "picking square 5x4 @50": "59:f0132b93",
        "preview flat 1x1 @37": "0:811c9dc5",
        "preview flat 1x1 @50": "0:811c9dc5",
        "preview flat 3x2 @37": "986:54d4e047",
        "preview flat 3x2 @50": "991:3fbec0a6",
        "preview flat 5x4 @37": "988:73dc47b5",
        "preview flat 5x4 @50": "991:bc0e6acc",
        "preview pointy 1x1 @37": "0:811c9dc5",
        "preview pointy 1x1 @50": "0:811c9dc5",
        "preview pointy 3x2 @37": "988:11817390",
        "preview pointy 3x2 @50": "981:2a83630d",
        "preview pointy 5x4 @37": "986:17926bea",
        "preview pointy 5x4 @50": "981:494fdb87",
        "preview square 1x1 @37": "0:811c9dc5",
        "preview square 1x1 @50": "0:811c9dc5",
        "preview square 3x2 @37": "179:7e15ddc7",
        "preview square 3x2 @50": "179:addff3bb",
        "preview square 5x4 @37": "179:7e15ddc7",
        "preview square 5x4 @50": "179:addff3bb",
        "scratched flat 1x1 @37": "0:811c9dc5",
        "scratched flat 1x1 @50": "0:811c9dc5",
        "scratched flat 3x2 @37": "737:642f9d48",
        "scratched flat 3x2 @50": "745:eb396bae",
        "scratched flat 5x4 @37": "739:1519868e",
        "scratched flat 5x4 @50": "745:75d89308",
        "scratched pointy 1x1 @37": "0:811c9dc5",
        "scratched pointy 1x1 @50": "0:811c9dc5",
        "scratched pointy 3x2 @37": "740:8cc537fa",
        "scratched pointy 3x2 @50": "732:9d812efc",
        "scratched pointy 5x4 @37": "738:60813030",
        "scratched pointy 5x4 @50": "732:6b47df4a",
        "scratched square 1x1 @37": "0:811c9dc5",
        "scratched square 1x1 @50": "0:811c9dc5",
        "scratched square 3x2 @37": "119:634f9641",
        "scratched square 3x2 @50": "119:4c02912d",
        "scratched square 5x4 @37": "119:634f9641",
        "scratched square 5x4 @50": "119:4c02912d",
        "untouched flat 1x1 @37": "0:811c9dc5",
        "untouched flat 1x1 @50": "0:811c9dc5",
        "untouched flat 3x2 @37": "0:811c9dc5",
        "untouched flat 3x2 @50": "0:811c9dc5",
        "untouched flat 5x4 @37": "0:811c9dc5",
        "untouched flat 5x4 @50": "0:811c9dc5",
        "untouched pointy 1x1 @37": "0:811c9dc5",
        "untouched pointy 1x1 @50": "0:811c9dc5",
        "untouched pointy 3x2 @37": "0:811c9dc5",
        "untouched pointy 3x2 @50": "0:811c9dc5",
        "untouched pointy 5x4 @37": "0:811c9dc5",
        "untouched pointy 5x4 @50": "0:811c9dc5",
        "untouched square 1x1 @37": "0:811c9dc5",
        "untouched square 1x1 @50": "0:811c9dc5",
        "untouched square 3x2 @37": "0:811c9dc5",
        "untouched square 3x2 @50": "0:811c9dc5",
        "untouched square 5x4 @37": "0:811c9dc5",
        "untouched square 5x4 @50": "0:811c9dc5",
      }
    `);
  });

  it('lays the same scratch markers as before', () => {
    const found: Record<string, string> = {};
    for (const state of Object.keys(SCRATCH_STATES)) {
      const shapes = everyShape((_, type, width, height, gridSize) => {
        const params = paramsFor(type, width, height, gridSize, state);
        return fingerprint(
          JSON.stringify(
            buildScratchingGridInfos({
              ...params,
              hasGameTableMask: true,
              isNonScratching: !params.scratchingGrids && !params.currentScratchingSet,
            })
          )
        );
      });
      for (const [label, value] of Object.entries(shapes)) found[`${state} ${label}`] = value;
    }
    expect(found).toMatchInlineSnapshot(`
      {
        "picking flat 1x1 @37": "274:750c0f89",
        "picking flat 1x1 @50": "268:b2d3f19d",
        "picking flat 3x2 @37": "541:90aedc43",
        "picking flat 3x2 @50": "532:9298c9fb",
        "picking flat 5x4 @37": "541:90aedc43",
        "picking flat 5x4 @50": "532:9298c9fb",
        "picking pointy 1x1 @37": "262:80ae9444",
        "picking pointy 1x1 @50": "254:3a4534de",
        "picking pointy 3x2 @37": "518:5cd54b07",
        "picking pointy 3x2 @50": "503:f8ec3c21",
        "picking pointy 5x4 @37": "518:5cd54b07",
        "picking pointy 5x4 @50": "503:f8ec3c21",
        "picking square 1x1 @37": "55:7d622f48",
        "picking square 1x1 @50": "51:248125f0",
        "picking square 3x2 @37": "107:410ef7a7",
        "picking square 3x2 @50": "99:1ec23349",
        "picking square 5x4 @37": "107:410ef7a7",
        "picking square 5x4 @50": "99:1ec23349",
        "preview flat 1x1 @37": "2:741638a5",
        "preview flat 1x1 @50": "2:741638a5",
        "preview flat 3x2 @37": "794:efea64c2",
        "preview flat 3x2 @50": "784:626cc9af",
        "preview flat 5x4 @37": "794:efea64c2",
        "preview flat 5x4 @50": "784:626cc9af",
        "preview pointy 1x1 @37": "2:741638a5",
        "preview pointy 1x1 @50": "2:741638a5",
        "preview pointy 3x2 @37": "796:e499af36",
        "preview pointy 3x2 @50": "790:0687e2ac",
        "preview pointy 5x4 @37": "796:e499af36",
        "preview pointy 5x4 @50": "790:0687e2ac",
        "preview square 1x1 @37": "2:741638a5",
        "preview square 1x1 @50": "2:741638a5",
        "preview square 3x2 @37": "161:9c637e68",
        "preview square 3x2 @50": "150:9797be0b",
        "preview square 5x4 @37": "161:9c637e68",
        "preview square 5x4 @50": "150:9797be0b",
        "scratched flat 1x1 @37": "2:741638a5",
        "scratched flat 1x1 @50": "2:741638a5",
        "scratched flat 3x2 @37": "524:a84d9e59",
        "scratched flat 3x2 @50": "514:1a4d6bc3",
        "scratched flat 5x4 @37": "524:a84d9e59",
        "scratched flat 5x4 @50": "514:1a4d6bc3",
        "scratched pointy 1x1 @37": "2:741638a5",
        "scratched pointy 1x1 @50": "2:741638a5",
        "scratched pointy 3x2 @37": "526:4d856cf3",
        "scratched pointy 3x2 @50": "517:846b67f8",
        "scratched pointy 5x4 @37": "526:4d856cf3",
        "scratched pointy 5x4 @50": "517:846b67f8",
        "scratched square 1x1 @37": "2:741638a5",
        "scratched square 1x1 @50": "2:741638a5",
        "scratched square 3x2 @37": "107:7bbf7e6d",
        "scratched square 3x2 @50": "99:db495b35",
        "scratched square 5x4 @37": "107:7bbf7e6d",
        "scratched square 5x4 @50": "99:db495b35",
        "untouched flat 1x1 @37": "2:741638a5",
        "untouched flat 1x1 @50": "2:741638a5",
        "untouched flat 3x2 @37": "2:741638a5",
        "untouched flat 3x2 @50": "2:741638a5",
        "untouched flat 5x4 @37": "2:741638a5",
        "untouched flat 5x4 @50": "2:741638a5",
        "untouched pointy 1x1 @37": "2:741638a5",
        "untouched pointy 1x1 @50": "2:741638a5",
        "untouched pointy 3x2 @37": "2:741638a5",
        "untouched pointy 3x2 @50": "2:741638a5",
        "untouched pointy 5x4 @37": "2:741638a5",
        "untouched pointy 5x4 @50": "2:741638a5",
        "untouched square 1x1 @37": "2:741638a5",
        "untouched square 1x1 @50": "2:741638a5",
        "untouched square 3x2 @37": "2:741638a5",
        "untouched square 3x2 @50": "2:741638a5",
        "untouched square 5x4 @37": "2:741638a5",
        "untouched square 5x4 @50": "2:741638a5",
      }
    `);
  });

  it('draws an untouched hex mask with exactly the outline mask', () => {
    const differing: string[] = [];
    for (const { name, type } of HEX_TYPES) {
      for (const [width, height] of MASK_SIZES) {
        for (const gridSize of CELL_SIZES) {
          const masks = buildMaskCss(paramsFor(type, width, height, gridSize, 'untouched'));
          if (masks !== buildHexOutlineMask(gridSize, type, width, height))
            differing.push(`${name} ${width}x${height}`);
        }
      }
    }
    expect(differing).toEqual([]);
  });

  it('tells an empty hex mask apart from an empty outline', () => {
    const params = paramsFor(GridType.HEX_VERTICAL, 0, 3, 50, 'untouched');
    expect(buildHexOutlineMask(50, GridType.HEX_VERTICAL, 0, 3)).toBe('');
    expect(buildMaskCss(params)).toBe('radial-gradient(#000, #000) 0px 0px / 0px 0px no-repeat');
  });
});
