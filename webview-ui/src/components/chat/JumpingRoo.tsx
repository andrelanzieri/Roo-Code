import React from "react"

export const JumpingRoo = () => (
	<div
		style={{
			width: "16px",
			height: "16px",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			position: "relative",
		}}>
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			style={{
				animation: "jumpingRoo 0.8s ease-in-out infinite",
			}}>
			{/* Kangaroo body */}
			<ellipse cx="8" cy="10" rx="3.5" ry="4" fill="currentColor" opacity="0.9" />
			{/* Kangaroo head */}
			<circle cx="8" cy="5" r="2.5" fill="currentColor" opacity="0.9" />
			{/* Kangaroo ears */}
			<ellipse
				cx="6.5"
				cy="3.5"
				rx="0.8"
				ry="1.5"
				fill="currentColor"
				opacity="0.9"
				transform="rotate(-15 6.5 3.5)"
			/>
			<ellipse
				cx="9.5"
				cy="3.5"
				rx="0.8"
				ry="1.5"
				fill="currentColor"
				opacity="0.9"
				transform="rotate(15 9.5 3.5)"
			/>
			{/* Kangaroo tail */}
			<path
				d="M5 11 Q2 12 1 14"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				fill="none"
				opacity="0.9"
			/>
			{/* Kangaroo legs */}
			<rect x="6" y="12" width="1.5" height="3" rx="0.5" fill="currentColor" opacity="0.9" />
			<rect x="8.5" y="12" width="1.5" height="3" rx="0.5" fill="currentColor" opacity="0.9" />
			{/* Kangaroo arms */}
			<rect
				x="5"
				y="8"
				width="1"
				height="2.5"
				rx="0.5"
				fill="currentColor"
				opacity="0.9"
				transform="rotate(-20 5.5 9.25)"
			/>
			<rect
				x="10"
				y="8"
				width="1"
				height="2.5"
				rx="0.5"
				fill="currentColor"
				opacity="0.9"
				transform="rotate(20 10.5 9.25)"
			/>
			{/* Kangaroo pouch */}
			<path d="M6.5 11 Q8 12 9.5 11" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.5" />
		</svg>
		<style>{`
			@keyframes jumpingRoo {
				0%, 100% {
					transform: translateY(0) scaleY(1);
				}
				20% {
					transform: translateY(0) scaleY(0.9);
				}
				40% {
					transform: translateY(-4px) scaleY(1.1);
				}
				60% {
					transform: translateY(-4px) scaleY(1.1);
				}
				80% {
					transform: translateY(0) scaleY(0.95);
				}
			}
		`}</style>
	</div>
)
