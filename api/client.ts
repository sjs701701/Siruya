import axios from 'axios';

const baseURL = __DEV__
    ? 'http://marketnumber.a-server.kr/api'  // 테스트서버
    : 'http://marketnumber.a-server.kr/api'  // 실서버

const client = axios.create({
    baseURL,
})

export function applyToken(jwt: string) {
    client.defaults.headers.common['Authorization'] = `Bearer ${jwt}`
}

export function clearToken() {
    client.defaults.headers.delete;
}

export default client;