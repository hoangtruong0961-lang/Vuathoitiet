cmake_minimum_required(VERSION 3.18.1)
project("vieneu-native")

add_library(vieneu-native SHARED
    vieneu_jni.cpp
)

target_include_directories(vieneu-native PRIVATE
    include
)

# Link against Android log library and optional prebuilt libvieneu/libaudio
find_library(log-lib log)

target_link_libraries(vieneu-native
    ${log-lib}
)
