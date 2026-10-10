# npm-stub

`@semantic-release/npm`はnpm CLIをまるごと依存に持ち、そのnpmは自分の依存を
`bundleDependencies`として同梱している。同梱物には未修正の`tar` / `undici` / `ip-address` /
`brace-expansion`が入っていて、**同梱物には`overrides`が届かない**（npm自身も
「It cannot be fixed automatically」と表示する）。修正済みの同梱物を持つnpmはまだ出ていない
（10.9.9は更に古く、11.19.0と12.0.2は同じ）。

そこで`overrides`で`npm`をこの空パッケージに差し替え、同梱物ごと`node_modules`から外す。

差し替えても動く理由は、`@semantic-release/npm`がnpmを**JSとしてimportしていない**から。
使うのは`execa("npm", …, { preferLocal: true })`だけで、`node_modules/.bin/npm`が無ければ
PATHのnpm（CIでは`actions/setup-node`が入れるもの）が使われる。バージョン番号を
`package.json`へ書き込む`npm version --no-git-tag-version`は、どのnpmでも同じ結果になる。

npm側が同梱物を差し替えたら、この差し替えは消してよい。判定は次のとおり。

```
npm view npm@<新しい版> dependencies   # tar が 7.5.21 以上を要求しているか
npm install                            # overrides から "npm" を外した状態で
npm audit                              # 0 件になるか
```
