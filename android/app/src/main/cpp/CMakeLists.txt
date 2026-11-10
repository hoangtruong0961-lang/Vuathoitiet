cmake_minimum_required(VERSION 3.18.1)
project("audio")

add_library(audio SHARED
    vieneu_jni.cpp
)

target_include_directories(audio PRIVATE
    include
)

# Link against Android log library
find_library(log-lib log)

target_link_libraries(audio
    ${log-lib}
)
