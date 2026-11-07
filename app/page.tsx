export default function Home() {
  return (
    <main>
      <header><a className="wordmark" href="/UDM/" aria-label="UDM ホーム">UDM<span>.</span></a></header>
      <section aria-labelledby="title">
        <p className="eyebrow">WELCOME TO UDM</p>
        <h1 id="title">ここから、<br />はじめよう。</h1>
        <p className="description">UDM のホームページへようこそ。</p>
        <a className="button" href="https://github.com/firstTimeFreeNow/UDM">GitHub で見る <span aria-hidden="true">↗</span></a>
      </section>
      <footer><span>UDM</span><span>はじまりの一歩。</span></footer>
    </main>
  );
}
