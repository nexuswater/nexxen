"use client";

import Image from "next/image";
import { DEMO_AVATARS } from "@/fixtures/demo-avatars";
import { useShownAvatar } from "@/components/use-shown-avatar";

/** Profile photo: X profile_image_url when configured, otherwise the chosen demo avatar. */
export function AccountAvatar({ className = "nxw-pfp" }: { className?: string }) {
  const shown = useShownAvatar();
  return (
    <Image
      className={className}
      src={shown.src}
      alt={shown.label}
      width={40}
      height={40}
      unoptimized
      draggable={false}
    />
  );
}

/** Sandbox picker. The same choice is shown on the card avatar slot. */
export function DemoAvatarPicker() {
  const shown = useShownAvatar();
  return (
    <div className="nxw-pfp-block">
      <div className="nxw-pfp-label" id="nxw-demo-avatars">
        Demo avatars
      </div>
      <div className="nxw-pfp-picker" role="group" aria-labelledby="nxw-demo-avatars">
        {DEMO_AVATARS.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            className="nxw-pfp-choice"
            aria-pressed={!shown.fromX && shown.demo.id === avatar.id}
            aria-label={
              avatar.placeholder
                ? `${avatar.label}. Original placeholder until the real file is dropped in.`
                : avatar.label
            }
            onClick={() => shown.selectDemoAvatar(avatar.id)}
          >
            <Image src={avatar.src} alt="" width={44} height={44} unoptimized draggable={false} />
          </button>
        ))}
      </div>
      {shown.fromX ? <p className="nxw-pfp-note">Showing the X profile photo. Demo avatars stay as the fallback.</p> : null}
    </div>
  );
}
