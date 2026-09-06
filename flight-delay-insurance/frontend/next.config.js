/** @type {import('next').NextConfig} */
console.log("DEBUG NEXT_PUBLIC_FLIGHT_DELAY_REPORTER_ADDRESS =", JSON.stringify(process.env.NEXT_PUBLIC_FLIGHT_DELAY_REPORTER_ADDRESS));
console.log("DEBUG NEXT_PUBLIC_CREDITCOIN_CHAIN_ID =", JSON.stringify(process.env.NEXT_PUBLIC_CREDITCOIN_CHAIN_ID));

module.exports = {
  reactStrictMode: true,
};
