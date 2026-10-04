export function FarmArt() {
  return (
    <svg
      className="farm-art"
      viewBox="0 0 620 300"
      role="img"
      aria-label="An original illustration of a cheerful red barn, tractor and green fields"
    >
      <defs>
        <clipPath id="landClip">
          <path d="M20 196Q99 110 213 169Q339 82 444 154Q554 124 618 217L618 300H10Z" />
        </clipPath>
        <pattern
          id="fieldLines"
          width="48"
          height="48"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-28)"
        >
          <path d="M0 0V48" stroke="#236542" strokeWidth="14" />
        </pattern>
      </defs>
      <g
        stroke="#283e2c"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g className="sun">
          <circle cx="482" cy="62" r="32" fill="#ffd450" />
          <path d="M482 15V5m0 114v-10m-47-47h-10m113 0h-10m-78-34-7-7m78 78-7-7m0-65 7-7m-78 78 7-7" />
          <path d="M472 66q10 13 20 0" fill="none" />
          <path d="M472 53v3m20-3v3" />
        </g>
        <path
          d="M37 74c-8-17 14-31 26-17 6-25 38-23 43 1 18-9 30 7 25 18H37Z"
          fill="#fffdf0"
          stroke="none"
        />
        <path
          d="M310 34c-5-10 9-20 17-12 4-16 24-14 28 1 12-5 20 5 16 12Z"
          fill="#fffdf0"
          stroke="none"
        />
        <path
          d="M20 196Q99 110 213 169Q339 82 444 154Q554 124 618 217L618 300H10Z"
          fill="#9fc661"
          stroke="none"
        />
        <path
          d="M-10 239Q168 138 290 203Q459 262 645 185V330H-10Z"
          fill="#54a44e"
          stroke="none"
        />
        <g clipPath="url(#landClip)">
          <path
            d="M339 237Q453 218 640 253V330H306Z"
            fill="#2e7b45"
            stroke="none"
          />
          <path
            d="M339 237Q453 218 640 253V330H306Z"
            fill="url(#fieldLines)"
            stroke="none"
          />
        </g>
        <path
          d="M287 185Q229 215 183 299h72q18-70 66-100Z"
          fill="#e8ca83"
          stroke="none"
        />
        <path d="M278 166v-44l-12-8v-8h25v60" fill="#f0ddad" />
        <path d="M293 188V119l56-46 55 46v69Z" fill="#e36b48" />
        <path d="m283 121 66-58 66 58-13 8-53-45-54 46Z" fill="#375d44" />
        <path d="M310 141h77v47h-77Z" fill="#b93e30" />
        <path d="M348 142v45m-36-43 73 41m0-40-73 41" stroke="#ffe7b4" />
        <path d="M336 103h25v23h-25Z" fill="#ffe7b4" />
        <path d="M348 104v20m-11-9h23" />
        <path d="M296 132h105M299 188h108" stroke="#f2ad80" />
        <path d="M90 166v43m-27-10h58" fill="none" />
        <path
          d="M90 105c-35 11-49 41-31 54-9 25 39 35 53 16 31 5 37-27 16-37 2-22-23-36-38-33Z"
          fill="#408247"
        />
        <path d="M102 154c-5 6-9 10-12 13" fill="none" />
        <g transform="translate(375 177)">
          <path d="M8 21h61v31H2V32Z" fill="#ec6b48" />
          <path d="M15 22V-9h30l10 31" fill="#e36b48" />
          <path d="M22 19V-2h17l8 21Z" fill="#bed8b2" />
          <path d="M64 19V1h7v18M9-13h38" fill="none" />
          <path d="M54 30h14m-13 8h13" />
          <circle cx="18" cy="51" r="23" fill="#33422f" />
          <circle cx="18" cy="51" r="11" fill="#efd491" />
          <circle cx="71" cy="52" r="15" fill="#33422f" />
          <circle cx="71" cy="52" r="6" fill="#efd491" />
          <path d="M-8 28q25-22 46 1" fill="#e36b48" />
        </g>
        <g fill="#f9e4ab">
          <path d="M142 188v36m34-44v34m-36-12 38-9m-38 19 38-9" />
          <path d="M523 172v35m33-27v34m-35-30 38 9m-37 3 37 9" />
        </g>
        <g stroke="#f8df86" strokeWidth="3">
          <path d="M37 245v22m-7-20 7 7 7-7m-11-8 4 6 4-6m34 12v22m-7-20 7 7 7-7m-11-8 4 6 4-6m32 16v22m-7-20 7 7 7-7m-11-8 4 6 4-6" />
        </g>
        <g transform="translate(270 250)">
          <path
            d="M0 0c-9-12-21 0-16 11-2 15 25 18 30 5 7-3 4-13-2-13Z"
            fill="#fff9e1"
          />
          <path d="m11 2 9 3-7 5" fill="#f4b638" />
          <path d="M-3-3q-3-12 3-9 6-9 7 1" fill="#d9563b" />
          <path d="M-5 25v6m10-6v6" />
          <circle cx="8" cy="6" r="1.5" fill="#283e2c" stroke="none" />
        </g>
        <path
          d="M198 115q8-10 17 0 9-10 17 0m-48-21q6-7 12 0 6-7 12 0"
          fill="none"
          strokeWidth="2.5"
        />
      </g>
    </svg>
  );
}

export function CategoryArt({
  type,
}: {
  type: "fields" | "inventory" | "machines" | "team";
}) {
  return (
    <svg className="category-art" viewBox="0 0 100 80" aria-hidden="true">
      <g
        stroke="#293d2b"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {type === "fields" && (
          <>
            <path d="M8 51 48 31l44 19-42 24Z" fill="#53a54b" />
            <path
              d="m17 53 32-15m-19 21 32-16M43 65l33-17"
              fill="none"
              stroke="#286b37"
            />
            <path
              d="M52 40V9m-1 16C35 26 37 12 37 12c13-2 15 8 14 13m1-8C52 4 64 6 64 6c1 11-6 14-12 13"
              fill="#89b952"
            />
            <path
              d="M75 33V17m0 7c11 1 12-10 12-10-11-1-12 10-12 10"
              fill="#b0cd5c"
            />
          </>
        )}
        {type === "inventory" && (
          <>
            <path d="M22 24h57v47H22Z" fill="#f4c65d" />
            <path d="m14 28 37-21 36 21Z" fill="#e97953" />
            <path d="M38 43h26v28H38Z" fill="#bd823a" />
            <path d="M50 45v24m-10-21 22 19m0-19L40 67" stroke="#fbe5a4" />
            <path d="M16 71h70M26 33h49" />
            <path d="M64 8V2h8v12" fill="#f4c65d" />
          </>
        )}
        {type === "machines" && (
          <>
            <path d="M18 43h56v20H13V49Z" fill="#e76143" />
            <path d="M25 43V16h25l8 27" fill="#e76143" />
            <path d="M31 38V22h13l6 16Z" fill="#cde3c6" />
            <path d="M70 41V25h5v16M20 14h34" />
            <circle cx="28" cy="62" r="17" fill="#394532" />
            <circle cx="28" cy="62" r="8" fill="#f4d994" />
            <circle cx="75" cy="64" r="11" fill="#394532" />
            <circle cx="75" cy="64" r="4" fill="#f4d994" />
            <path d="M11 47q18-16 34 0" fill="#e76143" />
          </>
        )}
        {type === "team" && (
          <>
            <path d="M15 71V57q0-15 19-15t19 15v14" fill="#65995b" />
            <circle cx="34" cy="31" r="15" fill="#ecc38c" />
            <path d="M12 22h44M21 21l3-14h21l3 14" fill="#f1c251" />
            <path d="M55 72V52q0-14 16-14t16 14v20" fill="#d97858" />
            <circle cx="71" cy="28" r="13" fill="#f4d4a2" />
            <path
              d="M58 25q-4-23 17-17 13 3 9 17-5-4-8-13-5 11-18 13Z"
              fill="#4b4c31"
            />
            <path
              d="M29 32v1m10-1v1m27-5v1m10-1v1m-46 9q5 4 10 0m28-3q4 4 8 0"
              fill="none"
            />
          </>
        )}
      </g>
    </svg>
  );
}
