export interface User {
    mb_no: number;
    mb_id: string;
    mb_name: string;
    mb_email: string;
    mb_nick: string;
    mb_password: string;
    mb_password_re: string;
    imgurl: string;
    mb_point: number;
    mb_profile_yn: string;
    mb_sex: string;
    mb_birth: string;
    mb_intro: string;
    mb_hp: string;
    jwt: string;
}
export interface Config {
    app_name: string;
}
export interface AuthResult {
    statusCode: string;
    jwt: string;
    user: User;
    config : Config;
    message: string;
}

export type errorData = {
    statusCode: string;
    msg: string;
}