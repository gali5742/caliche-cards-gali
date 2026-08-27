import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07111d",
        }}
      >
        <div
          style={{
            position: "relative",
            width: 112,
            height: 126,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 78,
              height: 104,
              borderRadius: 16,
              background: "#12304a",
              transform: "rotate(-10deg) translate(-8px, 1px)",
              border: "3px solid #1f577e",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 82,
              height: 108,
              borderRadius: 17,
              background: "#0d1f31",
              transform: "rotate(7deg) translate(9px, 0px)",
              border: "3px solid #203c55",
            }}
          />
          <div
            style={{
              position: "relative",
              width: 82,
              height: 108,
              borderRadius: 17,
              background: "#0f2235",
              border: "3px solid #16b8ed",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 9,
              padding: "0 16px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ width: 24, height: 7, borderRadius: 999, background: "#16b8ed" }} />
            <div style={{ width: 49, height: 7, borderRadius: 999, background: "#f3f8fc" }} />
            <div style={{ width: 39, height: 7, borderRadius: 999, background: "#8ba5bb" }} />
          </div>
        </div>
      </div>
    ),
    size
  );
}
