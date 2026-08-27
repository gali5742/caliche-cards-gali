import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 116,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 300,
            height: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 210,
              height: 270,
              borderRadius: 42,
              background: "#12304a",
              transform: "rotate(-10deg) translate(-22px, 2px)",
              border: "8px solid #1f577e",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 220,
              height: 280,
              borderRadius: 44,
              background: "#0d1f31",
              transform: "rotate(7deg) translate(24px, 0px)",
              border: "8px solid #203c55",
            }}
          />
          <div
            style={{
              position: "relative",
              width: 220,
              height: 280,
              borderRadius: 44,
              background: "#0f2235",
              border: "8px solid #16b8ed",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 24,
              padding: "0 42px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ width: 64, height: 18, borderRadius: 999, background: "#16b8ed" }} />
            <div style={{ width: 132, height: 18, borderRadius: 999, background: "#f3f8fc" }} />
            <div style={{ width: 104, height: 18, borderRadius: 999, background: "#8ba5bb" }} />
          </div>
        </div>
      </div>
    ),
    size
  );
}
