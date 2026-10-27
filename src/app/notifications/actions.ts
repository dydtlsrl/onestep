"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// 알림을 읽음으로 바꾸고 알림이 가리키는 화면으로 보낸다 (DB 권한 규칙상 자기 알림만 바뀐다)
export async function openNotification(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) redirect("/notifications");

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("read_at", null)
    .select("link")
    .maybeSingle<{ link: string }>();
  let link = data?.link;
  if (link === undefined) {
    const { data: existing } = await supabase.from("notifications").select("link").eq("id", id.data).maybeSingle<{ link: string }>();
    link = existing?.link;
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(link, "/notifications"));
}

export async function markAllRead() {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/", "layout");
}
