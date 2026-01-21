import React from "react";
import { Pressable, Text } from "react-native";

import { authClient } from "@/lib/authClient";
import { resetSession } from "@/lib/authBootstrap";
import { useSession } from "@/lib/useSession";
import { cn } from "@/lib/cn";
import { useRouter } from "expo-router";

const LoginButton = () => {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  return (
    <Pressable
      disabled={isPending}
      onPress={async () => {
        if (session) {
          try {
            await resetSession({ reason: "auth_cleanup", endpoint: "LoginButton" });
            router.replace("/welcome");
          } catch (error) {
            console.error("[LoginButton] Error during logout:", error);
            // Navigate anyway
            router.replace("/welcome");
          }
        } else {
          router.push("/login");
        }
      }}
      className={cn("p-4 rounded-md", session ? "bg-red-500" : "bg-blue-500")}
    >
      <Text className="text-white">{session ? "Logout" : "Login"}</Text>
    </Pressable>
  );
};

export default LoginButton;
