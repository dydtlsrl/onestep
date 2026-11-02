import { startTransition, type FormEvent } from "react";

// React 19는 <form action={...}>을 보내면 결과와 상관없이 입력칸을 처음 값으로 되돌린다.
// 오류가 나도 적은 내용이 남도록 onSubmit으로 보낸다. (보내는 중 표시는 useActionState의 isPending으로)
export function keepValuesOnSubmit(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
